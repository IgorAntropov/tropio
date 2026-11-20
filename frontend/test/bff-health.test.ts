import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, expect, it } from 'vitest'

let upstreamStatus = 200
let identityDisconnected = false
let forwarded: Record<string, string | string[] | undefined> = {}
let forwardedBody = ''
const requestId = 'baf65e50-9760-4ca7-9d3f-09f71db01b05'
const routeId = '6933c278-1263-4f4e-a23e-d49572b0bc4d'
const dayId = '1b3f80cd-f580-4164-9d3c-71e5e058ba95'
const revision = 'a927c255-8f67-4f16-b9b7-5d3922350956'
const picture = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

const upstream = createServer(async (request, response) => {
  if (request.url === '/api/v1/trips?cursor=a&limit=20') {
    forwarded = request.headers
    response.writeHead(200, { 'content-type': 'application/json', 'x-request-id': requestId })
      .end(JSON.stringify({ items: [], next_cursor: null }))
    return
  }
  if (request.url === `/api/v1/routes/${routeId}` && request.method === 'PUT') {
    forwarded = request.headers
    forwardedBody = (await Array.fromAsync(request)).map(chunk => chunk.toString()).join('')
    response.writeHead(409, { 'content-type': 'application/problem+json; charset=utf-8', 'x-request-id': requestId })
      .end(JSON.stringify({
        type: 'about:blank', title: 'Conflict', status: 409, code: 'ROUTE_REVISION_CONFLICT',
        request_id: requestId, current_route_revision_id: revision,
      }))
    return
  }
  if (request.url === `/api/v1/days/${dayId}/route`) {
    request.socket.destroy()
    return
  }
  if (request.url === `/api/v1/pois/${routeId}/media/${revision}`) {
    response.writeHead(200, { 'content-type': 'image/png', 'x-request-id': requestId }).end(picture)
    return
  }
  if (request.url === '/api/v1/auth/register') {
    forwarded = request.headers
    request.resume()
    response.writeHead(202, {
      'set-cookie': [
        'tropio_registration=register-session; HttpOnly; SameSite=Strict; Path=/',
        'tropio_session=current-session; HttpOnly; SameSite=Lax; Path=/',
        'unrelated=hidden; HttpOnly; Path=/',
      ],
      'x-request-id': request.headers['x-request-id'] ?? requestId,
    }).end()
    return
  }
  if (request.url === '/api/v1/auth/logout') {
    response.writeHead(204, {
      'set-cookie': 'tropio_session=; Max-Age=0; HttpOnly; Path=/',
    }).end()
    return
  }
  if (request.url === '/api/v1/me' && identityDisconnected) {
    request.socket.destroy()
    return
  }
  if (request.url === '/api/v1/me' && request.headers.cookie === 'tropio_session=workspace-active') {
    response.writeHead(200, { 'content-type': 'application/json', 'x-request-id': requestId })
      .end(JSON.stringify({
        id: routeId, display_name: 'Путешественник', bio: null, avatar: null, csrf_token: 'workspace-csrf-fixture',
      }))
    return
  }
  if (request.url?.startsWith('/api/v1/users/') || request.url === '/api/v1/me') {
    forwarded = request.headers
    const publicProfile = request.url.startsWith('/api/v1/users/')
    const status = publicProfile ? 400 : 401
    const id = request.headers['x-request-id'] ?? requestId
    response.writeHead(status, {
      'content-type': 'application/problem+json',
      'x-request-id': id,
    }).end(JSON.stringify({
      type: 'about:blank',
      title: publicProfile ? 'Invalid request' : 'Session required',
      status,
      code: publicProfile ? 'INVALID_REQUEST' : 'SESSION_REQUIRED',
      request_id: id,
    }))
    return
  }
  if (request.method !== 'GET' || request.url !== '/api/v1/health') {
    response.writeHead(404).end()
    return
  }

  response.writeHead(upstreamStatus, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ status: upstreamStatus === 200 ? 'ok' : 'unavailable' }))
})

afterAll(async () => {
  if (upstream.listening) {
    upstream.close()
    await once(upstream, 'close')
  }
})

await once(upstream.listen(0, '127.0.0.1'), 'listening')
const address = upstream.address()

if (!address || typeof address === 'string') {
  throw new Error('The BFF test server did not bind to an HTTP port')
}

await setup({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  browser: false,
  server: true,
  build: true,
  env: {
    NUXT_BFF_BASE_URL: `http://127.0.0.1:${address.port}`,
    NUXT_BFF_PROXY_SECRET: 'identity-proxy-test-only',
  },
})

it('returns the BFF health response through the Nuxt origin', async () => {
  const response = await fetch('/api/v1/health')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})

it.each(['/', '/login', '/feed'])('renders a neutral session check in SSR at %s without the API-scoped cookie', async (path) => {
  const response = await fetch(path)
  const html = await response.text()

  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(html).toContain('Проверяем сессию')
  expect(html).not.toContain('<h1>Вход по почте</h1>')
  expect(html).not.toContain('<h1>Лента</h1>')
})

it('renders the Russian document language and product title at the entry route', async () => {
  const response = await fetch('/')
  const html = await response.text()

  expect(response.status).toBe(200)
  expect(html).toMatch(/<html\b[^>]*\blang="ru"/)
  expect(html).toContain('<title>Тропио</title>')
})

it.each(['/', '/login'])('sends an SSR request with a verified session at %s to the feed', async (path) => {
  const response = await fetch(path, {
    headers: { cookie: 'tropio_session=workspace-active' },
    redirect: 'manual',
  })

  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('/feed')
  expect(response.headers.get('cache-control')).toBe('no-store')
})

it('allows server-rendered workspace content with an active session without serializing session secrets', async () => {
  const response = await fetch('/feed', { headers: { cookie: 'tropio_session=workspace-active' } })
  const html = await response.text()

  expect(response.status).toBe(200)
  expect(html).toMatch(/<h1[^>]*>Лента<\/h1>/)
  expect(html).not.toContain('workspace-csrf-fixture')
  expect(html).not.toContain('workspace-active')
})

it.each([
  ['/', null],
  ['/map', '/map'],
])('sends an expired SSR session at %s to login', async (path, returnTo) => {
  const response = await fetch(path, {
    headers: { cookie: 'tropio_session=workspace-expired' },
    redirect: 'manual',
  })
  const location = new URL(response.headers.get('location') ?? '/', 'http://localhost')

  expect(response.status).toBe(302)
  expect(location.pathname).toBe('/login')
  expect(location.searchParams.get('returnTo')).toBe(returnTo)
})

it.each(['/', '/login', '/feed'])('returns 503 at %s when session verification is unavailable', async (path) => {
  identityDisconnected = true
  try {
    const response = await fetch(path, {
      headers: { cookie: 'tropio_session=workspace-active' },
      redirect: 'manual',
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('location')).toBeNull()
  } finally {
    identityDisconnected = false
  }
})

it('returns a gateway error when the BFF health check fails', async () => {
  upstreamStatus = 503

  try {
    const response = await fetch('/api/v1/health')

    expect(response.status).toBe(502)
  } finally {
    upstreamStatus = 200
  }
})

it('forwards Identity cookies and Origin through the Nuxt proxy with an empty 202 response', async () => {
  const response = await fetch('/api/v1/auth/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': 'tropio_registration=previous; ignored=secret; tropio_session=active',
      'origin': 'http://127.0.0.1:3000',
      'x-request-id': requestId,
      'x-forwarded-for': '203.0.113.10',
      'x-tropio-client-ip': '203.0.113.11',
      'x-tropio-proxy-secret': 'forged',
    },
    body: JSON.stringify({ email: 'local@example.test', password: 'long-local-password', accepted_terms: true }),
  })
  expect(response.status).toBe(202)
  expect(await response.text()).toBe('')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('x-request-id')).toBe(requestId)
  expect(response.headers.getSetCookie()).toEqual([
    'tropio_registration=register-session; HttpOnly; SameSite=Strict; Path=/',
    'tropio_session=current-session; HttpOnly; SameSite=Lax; Path=/',
  ])
  expect(forwarded.cookie).toBe('tropio_session=active; tropio_registration=previous')
  expect(forwarded.origin).toBe('http://127.0.0.1:3000')
  expect(forwarded['x-request-id']).toBe(requestId)
  expect(forwarded['x-forwarded-for']).toBeUndefined()
  expect(forwarded['x-tropio-client-ip']).toMatch(/^(?:::ffff:)?127\.0\.0\.1$/)
  expect(forwarded['x-tropio-proxy-secret']).toBe('identity-proxy-test-only')
})

it('preserves an empty 204 response and the expired session cookie', async () => {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    headers: { 'x-csrf-token': 'local-token', 'origin': 'http://127.0.0.1:3000' },
  })
  expect(response.status).toBe(204)
  expect(await response.text()).toBe('')
  expect(response.headers.getSetCookie()).toEqual(['tropio_session=; Max-Age=0; HttpOnly; Path=/'])
})

it.each([
  ['/api/v1/me', 401, 'SESSION_REQUIRED'],
  ['/api/v1/users/%3Fbad-id', 400, 'INVALID_REQUEST'],
])('preserves BFF problem details through Nuxt for %s', async (url, status, code) => {
  const response = await fetch(url, { headers: { 'x-request-id': requestId } })
  const payload = await response.text()
  expect(response.status, payload).toBe(status)
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json/)
  expect(response.headers.get('x-request-id')).toBe(requestId)
  expect(JSON.parse(payload)).toMatchObject({ status, code, request_id: requestId })
})

it('maps an unavailable Identity upstream to a correlated 503 Problem', async () => {
  identityDisconnected = true
  try {
    const response = await fetch('/api/v1/me', { headers: { 'x-request-id': requestId } })
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json/)
    expect(response.headers.get('x-request-id')).toBe(requestId)
    expect(await response.json()).toMatchObject({ status: 503, code: 'DEPENDENCY_UNAVAILABLE', request_id: requestId })
  } finally {
    identityDisconnected = false
  }
})

it('passes Travel pagination and only the session cookie', async () => {
  const response = await fetch('/api/v1/trips?cursor=a&limit=20', {
    headers: { cookie: 'tropio_session=current; tropio_registration=pending; ignored=value' },
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ items: [], next_cursor: null })
  expect(forwarded.cookie).toBe('tropio_session=current')
})

it('relays the Geo conflict and preserves the write body, CSRF, Origin and command key', async () => {
  const body = JSON.stringify({ route_revision_id: null, points: [], tracks: [], padding: 'a'.repeat(16_000) })
  const response = await fetch(`/api/v1/routes/${routeId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json', 'x-csrf-token': 'csrf', 'idempotency-key': revision,
      'origin': 'http://127.0.0.1:3000', 'cookie': 'tropio_session=active',
    },
    body,
  })
  expect(response.status).toBe(409)
  expect(response.headers.get('x-request-id')).toBe(requestId)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toMatchObject({ code: 'ROUTE_REVISION_CONFLICT', current_route_revision_id: revision, request_id: requestId })
  expect(forwarded).toMatchObject({
    'content-type': 'application/json', 'x-csrf-token': 'csrf', 'idempotency-key': revision,
    'origin': 'http://127.0.0.1:3000', 'cookie': 'tropio_session=active',
  })
  expect(forwardedBody).toBe(body)
})

it('serves POI images without modifying the bytes or enabling caching', async () => {
  const response = await fetch(`/api/v1/pois/${routeId}/media/${revision}`)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('image/png')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(picture)
})

it('rejects undeclared editor operations and encoded route separators', async () => {
  const unexpected = await fetch(`/api/v1/routes/${routeId}`, { method: 'DELETE' })
  const invalid = await fetch('/api/v1/routes/%2Fshadow')
  expect(unexpected.status).toBe(404)
  expect(await unexpected.json()).toMatchObject({ code: 'NOT_FOUND' })
  expect(invalid.status).toBe(400)
  expect(await invalid.json()).toMatchObject({ code: 'INVALID_REQUEST' })
})

it('maps an editor dependency disconnect to a correlated 503 Problem', async () => {
  const response = await fetch(`/api/v1/days/${dayId}/route`, {
    method: 'PUT', headers: { 'x-request-id': requestId },
  })
  expect(response.status).toBe(503)
  expect(response.headers.get('x-request-id')).toBe(requestId)
  expect(await response.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', request_id: requestId })
})
