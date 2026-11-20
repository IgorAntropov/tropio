import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'

const identityRoutes = new Set([
  'POST auth/login',
  'POST auth/register',
  'POST auth/resend-verification',
  'POST auth/verify-email',
  'POST auth/refresh',
  'POST auth/logout',
  'POST auth/request-password-reset',
  'POST auth/reset-password',
  'GET me',
  'PATCH me',
  'PATCH me/avatar',
  'GET avatar-assets',
])

const cookieNames = ['tropio_session', 'tropio_registration']
const maxBodyBytes = 8192

type Event = Parameters<typeof getRequestURL>[0]

function problem(event: Event, requestId: string, status: number, code: string, title: string) {
  setResponseStatus(event, status)
  setResponseHeader(event, 'content-type', 'application/problem+json')
  setResponseHeader(event, 'x-request-id', requestId)
  return { type: 'about:blank', title, status, code, request_id: requestId }
}

async function boundedBody(event: Event) {
  const request = event.node.req
  if (Number(getRequestHeader(event, 'content-length')) > maxBodyBytes) {
    request.resume()
    return null
  }
  const chunks: Uint8Array[] = []
  let size = 0

  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.from(chunk)
    size += bytes.byteLength
    if (size > maxBodyBytes) {
      request.resume()
      return null
    }
    chunks.push(bytes)
  }
  return size ? Buffer.concat(chunks).toString('utf8') : undefined
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const method = getMethod(event)
  const path = getRouterParam(event, 'identity') ?? ''
  const incomingId = getRequestHeader(event, 'x-request-id')
  const requestId = incomingId && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(incomingId) ? incomingId : randomUUID()
  const publicProfileSegment = method === 'GET'
    ? /^\/api\/v1\/users\/([^/]+)$/.exec(getRequestURL(event).pathname)?.[1]
    : undefined
  let upstreamPath = path
  if (publicProfileSegment) {
    let userId: string
    try {
      userId = decodeURIComponent(publicProfileSegment)
    } catch {
      return problem(event, requestId, 400, 'INVALID_REQUEST', 'Invalid request')
    }
    if (userId === '.' || userId === '..') return problem(event, requestId, 400, 'INVALID_REQUEST', 'Invalid request')
    upstreamPath = `users/${encodeURIComponent(userId)}`
  } else if (!identityRoutes.has(`${method} ${path}`)) {
    return problem(event, requestId, 404, 'NOT_FOUND', 'Not found')
  }

  const config = useRuntimeConfig(event)
  const headers = new Headers({ accept: 'application/json, application/problem+json', 'x-request-id': requestId })
  for (const name of ['content-type', 'origin', 'x-csrf-token']) {
    const value = getRequestHeader(event, name)
    if (value) headers.set(name, value)
  }

  const cookies = cookieNames.flatMap((name) => {
    const value = getCookie(event, name)
    return value && /^[\w.-]{1,256}$/.test(value) ? [`${name}=${value}`] : []
  })
  if (cookies.length) headers.set('cookie', cookies.join('; '))

  const clientIP = getRequestIP(event)
  if (config.bffProxySecret && clientIP && isIP(clientIP)) {
    headers.set('x-tropio-proxy-secret', config.bffProxySecret)
    headers.set('x-tropio-client-ip', clientIP)
  }

  let body: string | undefined
  if (method !== 'GET') {
    const input = await boundedBody(event).catch(() => null)
    if (input === null) return problem(event, requestId, 400, 'INVALID_REQUEST', 'Invalid request')
    body = input
  }

  try {
    const url = new URL(`/api/v1/${upstreamPath}`, config.bffBaseUrl)
    const response = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })
    const type = response.headers.get('content-type')
    if (!response.ok && !type?.startsWith('application/problem+json')) {
      return problem(event, requestId, 503, 'DEPENDENCY_UNAVAILABLE', 'Identity unavailable')
    }

    const payload = response.status === 204 || response.status === 202 ? null : await response.text()
    setResponseStatus(event, response.status)
    setResponseHeader(event, 'x-request-id', response.headers.get('x-request-id') ?? requestId)
    if (type) setResponseHeader(event, 'content-type', type)
    const retryAfter = response.headers.get('retry-after')
    if (retryAfter && /^\d+$/.test(retryAfter)) setResponseHeader(event, 'retry-after', Number(retryAfter))

    for (const cookie of response.headers.getSetCookie()) {
      if (cookieNames.some(name => cookie.startsWith(`${name}=`))) {
        appendResponseHeader(event, 'set-cookie', cookie)
      }
    }
    if (payload === null) return sendNoContent(event, response.status)
    return send(event, payload)
  } catch {
    return problem(event, requestId, 503, 'DEPENDENCY_UNAVAILABLE', 'Identity unavailable')
  }
})
