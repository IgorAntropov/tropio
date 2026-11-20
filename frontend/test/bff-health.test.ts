import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, expect, it } from 'vitest'
import type { PublicTrip, PublicTripSummary } from '../src/shared/api'

let upstreamStatus = 200
let identityDisconnected = false
let forwarded: Record<string, string | string[] | undefined> = {}
let forwardedBody = ''
const requestId = 'baf65e50-9760-4ca7-9d3f-09f71db01b05'
const routeId = '6933c278-1263-4f4e-a23e-d49572b0bc4d'
const dayId = '1b3f80cd-f580-4164-9d3c-71e5e058ba95'
const revision = 'a927c255-8f67-4f16-b9b7-5d3922350956'
const picture = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

const catalogSummary = {
  trip_id: routeId, publication_id: revision, organizer: { id: dayId, display_name: 'Анна', avatar: null }, title: 'Тропа от лагеря до смотровой', description: 'Лесной маршрут',
  start: { lon: 84.96, lat: 56.46 }, start_date: '2026-12-05', end_date: null, day_count: 1,
  difficulty: null, free_capacity: 3, trip_type: 'foot', lifecycle: 'planned',
  admission_mode: 'request', confirmed_participants: 1, applications_open: true,
} satisfies PublicTripSummary
const catalogDetail = {
  ...catalogSummary,
  days: [{
    position: 1, local_date: catalogSummary.start_date, description: null,
    lines: [{ type: 'LineString', coordinates: [[84.96, 56.46], [84.99, 56.47]] }],
    legs: [{ name: 'По лесной тропе', start_name: 'Лагерь', end_name: 'Смотровая', distance_m: 2190, transport_mode: 'foot' }],
  }],
  pois: [],
} satisfies PublicTrip
let catalogStatus = 200
let catalogDates: Pick<PublicTripSummary, 'start_date' | 'end_date'> | undefined

const upstream = createServer(async (request, response) => {
  if (request.url === '/api/v1/catalog/filter-options') {
    forwarded = request.headers
    response.writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ regions: [{ value: 'RU-TOM', label: 'Томская область' }], difficulties: [{ value: 'easy', label: 'Лёгкая' }] }))
    return
  }
  if (request.url?.split('?')[0] === '/api/v1/catalog/trips' || request.url === `/api/v1/catalog/trips/${routeId}`) {
    forwarded = request.headers
    const list = request.url.split('?')[0] === '/api/v1/catalog/trips'
    if (catalogStatus !== 200 && !list) {
      response.writeHead(catalogStatus, { 'content-type': 'application/problem+json' })
        .end(JSON.stringify({ status: catalogStatus, code: catalogStatus === 404 ? 'NOT_FOUND' : 'DEPENDENCY_UNAVAILABLE' }))
    } else {
      response.writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(list ? { items: catalogStatus === 200 ? [catalogSummary] : [], next_cursor: null }
          : { ...catalogDetail, ...catalogDates }))
    }
    return
  }
  if (request.url === `/api/v1/catalog/participation?trip_ids=${routeId}` && request.method === 'GET') {
    forwarded = request.headers
    const member = request.headers.cookie === 'tropio_session=workspace-active'
    response.writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ viewer_id: member ? dayId : null, trip_ids: [], joined_trip_ids: member ? [routeId] : [] }))
    return
  }
  if (request.url === `/api/v1/trips/${routeId}/applications` && request.method === 'POST') {
    forwarded = request.headers
    forwardedBody = (await Array.fromAsync(request)).map(chunk => chunk.toString()).join('')
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'joined' }))
    return
  }
  if (request.url === `/api/v1/trips/${routeId}/archive` && request.method === 'POST') {
    forwarded = request.headers
    request.resume()
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ trip_revision_id: revision, publication_id: null }))
    return
  }
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

it('preserves the participation destination on the sign-in link below registration', async () => {
  const destination = `/catalog/${routeId}#participation`
  const response = await fetch('/register?' + new URLSearchParams({ returnTo: destination }))
  const html = await response.text()
  expect(response.status).toBe(200)
  expect(html).toContain('Уже есть аккаунт?')
  const signIn = html.match(/<a\b[^>]*href="([^"]+)"[^>]*>\s*Войти\s*<\/a>/)
  expect(signIn).toBeTruthy()
  const target = new URL(signIn![1]!, 'http://localhost')
  expect(target.pathname).toBe('/login')
  expect(target.searchParams.get('returnTo')).toBe(destination)
  expect(html).toMatch(/<a\b(?=[^>]*class="account-brand")(?=[^>]*href="\/catalog")[^>]*>/)
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
  ['/', '/catalog', null],
  ['/map', '/login', '/map'],
])('sends an expired SSR session at %s to %s', async (path, destination, returnTo) => {
  const response = await fetch(path, {
    headers: { cookie: 'tropio_session=workspace-expired' },
    redirect: 'manual',
  })
  const location = new URL(response.headers.get('location') ?? '/', 'http://localhost')

  expect(response.status).toBe(302)
  expect(location.pathname).toBe(destination)
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


it('renders the same published trip for guests and members and drops revoked SSR metadata', async () => {
  const headers = { cookie: 'tropio_session=workspace-active', 'x-csrf-token': 'ignore-on-public-read' }
  try {
    const catalog = await fetch('/catalog', { headers })
    expect(catalog.status).toBe(200)
    const publicHtml = await catalog.text()
    expect(publicHtml).toContain(catalogSummary.title)
    const loginLinkContent = publicHtml.match(/<a\b[^>]*href="\/login"[^>]*>([\s\S]*?)<\/a>/)?.[1]
    expect(loginLinkContent?.replace(/<[^>]+>/g, '').trim()).toBe('Войти')
    const details = await fetch(`/catalog/${routeId}`, { headers })
    expect(details.status).toBe(200)
    expect(details.headers.get('cache-control')).toContain('no-store')
    expect(await details.text()).toContain(catalogSummary.title)
    expect(forwarded.cookie).toBeUndefined()
    expect(forwarded['x-csrf-token']).toBeUndefined()
    for (const status of [404, 503]) {
      catalogStatus = status
      const hidden = await fetch(`/catalog/${routeId}`, { headers })
      expect(hidden.status).toBe(status)
      expect(hidden.headers.get('cache-control')).toContain('no-store')
      expect(await hidden.text()).not.toContain(catalogSummary.title)
    }
    const list = await fetch('/catalog', { headers })
    expect(await list.text()).not.toContain(catalogSummary.title)
    expect(await (await fetch('/sitemap.xml')).text()).not.toContain(routeId)
  } finally {
    catalogStatus = 200
  }
})

it.each([
  ['2026-03-01', null, '1 мар. 2026 г.'],
  ['2026-12-26', '2026-12-28', '26–28 дек. 2026 г.'],
  ['2026-03-01', '2026-03-03', '1–3 мар. 2026 г.'],
  ['2026-03-31', '2026-04-02', '31 мар. – 2 апр. 2026 г.'],
  ['2026-12-31', '2027-01-02', '31 дек. 2026 г. – 2 янв. 2027 г.'],
] as const)('renders the localized public trip period from %s to %s', async (start, end, expected) => {
  catalogDates = { start_date: start, end_date: end }
  try {
    const response = await fetch(`/catalog/${routeId}?screen=route&day=1`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(expected)
  } finally {
    catalogDates = undefined
  }
})

it('serves the public catalog dictionaries without forwarding account credentials', async () => {
  const response = await fetch('/api/v1/catalog/filter-options', {
    headers: { cookie: 'tropio_session=workspace-active', 'x-csrf-token': 'unused' },
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(await response.json()).toEqual({ regions: [{ value: 'RU-TOM', label: 'Томская область' }], difficulties: [{ value: 'easy', label: 'Лёгкая' }] })
  expect(forwarded.cookie).toBeUndefined()
  expect(forwarded['x-csrf-token']).toBeUndefined()
})

it.each([
  { cookie: 'tropio_registration=pending', session: undefined, viewer: null, joined: [] },
  { cookie: 'tropio_registration=pending; tropio_session=workspace-active', session: 'tropio_session=workspace-active', viewer: dayId, joined: [routeId] },
])('varies participation by session and disables caching for viewer $viewer', async ({ cookie, session, viewer, joined }) => {
  const response = await fetch(`/api/v1/catalog/participation?trip_ids=${routeId}`, {
    headers: { cookie, 'x-csrf-token': 'unused-on-read' },
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('vary')?.toLowerCase().split(/,\s*/)).toContain('cookie')
  expect(await response.json()).toEqual({ viewer_id: viewer, trip_ids: [], joined_trip_ids: joined })
  expect(forwarded.cookie).toBe(session)
  expect(forwarded['x-csrf-token']).toBeUndefined()
})

it('relays the admission mode, session, CSRF and origin when joining a trip', async () => {
  const body = JSON.stringify({ admission_mode: 'open' })
  const response = await fetch(`/api/v1/trips/${routeId}/applications`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'cookie': 'tropio_registration=pending; tropio_session=workspace-active',
      'origin': 'http://127.0.0.1:3000', 'x-csrf-token': 'workspace-csrf-fixture',
    },
    body,
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ status: 'joined' })
  expect(forwarded).toMatchObject({
    'content-type': 'application/json', 'cookie': 'tropio_session=workspace-active',
    'origin': 'http://127.0.0.1:3000', 'x-csrf-token': 'workspace-csrf-fixture',
  })
  expect(forwardedBody).toBe(body)
})

it('forwards the archive command through the public Nuxt origin', async () => {
  const result = await fetch(`/api/v1/trips/${routeId}/archive`, {
    method: 'POST', headers: { cookie: 'tropio_session=workspace-active', 'x-csrf-token': 'csrf', 'idempotency-key': requestId,
      'content-type': 'application/json' }, body: JSON.stringify({ trip_revision_id: revision }),
  })
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ trip_revision_id: revision, publication_id: null })
  expect(forwarded.cookie).toBe('tropio_session=workspace-active')
  expect(forwarded['idempotency-key']).toBe(requestId)
})
