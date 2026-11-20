import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, expect, it } from 'vitest'

let upstreamStatus = 200
let identityDisconnected = false
let forwarded: Record<string, string | string[] | undefined> = {}
const requestId = 'baf65e50-9760-4ca7-9d3f-09f71db01b05'

const upstream = createServer((request, response) => {
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

it('renders the confirmed BFF status in the server-rendered home page', async () => {
  const response = await fetch('/')

  expect(response.status).toBe(200)
  expect(await response.text()).toContain('API работает')
})

it('renders the Russian product name in the home page and document title', async () => {
  const response = await fetch('/')
  const html = await response.text()

  expect(response.status).toBe(200)
  expect(html).toMatch(/<html\b[^>]*\blang="ru"/)
  expect(html).toContain('<title>Тропио</title>')
  expect(html).toContain('<h1>Тропио</h1>')
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
