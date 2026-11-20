import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import process from 'node:process'
import type { NestNodeApplication } from '@nestjs/platform-node'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { createApplication } from '../src/create-application.js'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type Actor = { id: string; cookie: string; csrf: string }
type Server = { app: NestNodeApplication; origin: string }
type Position = { lon: number; lat: number }
type Point = { point_id: string; position: Position }
type Track = {
  track_id: string
  start_point_id: string
  end_point_id: string
  geometry: { type: string; coordinates: number[][] }
  status: string
  transport_mode: string
  build_mode: string
  distance_m: number
  estimated_duration_s?: number
  elevation_profile?: { source: string; vertical_datum: string; profile: { elevation_m: number | null }[] }
}
type Route = {
  route_id: string
  route_revision_id: string
  availability: string
  points: Point[]
  tracks: Track[]
  trip_type: string | null
}
type Poi = { poi_id: string; poi_revision_id: string; name: string; media: { media_id: string }[] }
type Trip = { trip_id: string; trip_revision_id: string; days: { day_id: string; route_id: string }[] }
type ContractSchema = {
  allOf?: ContractSchema[]
  oneOf?: ContractSchema[]
  properties?: { code?: { const?: string; enum?: string[] } }
}
type ContractResponse = {
  $ref: string
  content: Record<string, { schema: ContractSchema }>
}
type Operation = { tags?: string[]; responses: Record<string, { $ref?: string }> }
type ErrorProbe = { method: Method; path: string; endpoint: string; actor?: Actor; body?: object; badEndpoint?: string; foreignActor?: Actor }
type Contract = {
  paths: Record<string, Partial<Record<Lowercase<Method>, Operation>>>
  components: { responses: Record<string, ContractResponse> }
}

const browserOrigin = 'http://127.0.0.1:3000'
const password = 'geo-pilot-verification-password'
const uuidFormat = /^[0-9a-f-]{36}$/
const contract = parse(readFileSync(new URL('../../docs/contracts/openapi.yaml', import.meta.url), 'utf8')) as Contract
const mail: { email: string; token: string }[] = []
const servers: Server[] = []
const seen = new Set<string>()
let identityPool: pg.Pool
let geoPool: pg.Pool
let server: Server
let unavailable: Server
let owner: Actor
let visitor: Actor
let moderator: Actor
let ownerTrip: Trip
let visitorTrip: Trip
let categoryId: string

const positions = [
  { lon: 84.94, lat: 56.48 },
  { lon: 84.945, lat: 56.48 },
  { lon: 84.95, lat: 56.48 },
  { lon: 84.96, lat: 56.48 },
] as const

function encodeShape(points: Position[]): string {
  let lastLat = 0
  let lastLon = 0
  let result = ''
  for (const point of points) {
    const lat = Math.round(point.lat * 1e6)
    const lon = Math.round(point.lon * 1e6)
    for (const delta of [lat - lastLat, lon - lastLon]) {
      let value = delta < 0 ? -(delta * 2) - 1 : delta * 2
      while (value >= 32) {
        result += String.fromCharCode((value & 31) + 95)
        value >>= 5
      }
      result += String.fromCharCode(value + 63)
    }
    lastLat = lat
    lastLon = lon
  }
  return result
}

async function start(databaseUrl: string, identityUrl: string, travelUrl: string, routing: 'mock' | 'down' | 'pilot' = 'mock') {
  const app = await createApplication({ logger: false }, {
    databaseUrl: identityUrl,
    browserOrigin,
    secureCookies: false,
    mailer: { send: async (item) => { mail.push(item) } },
  }, { databaseUrl: travelUrl }, {
    databaseUrl,
    providers: routing === 'pilot' ? undefined : {
      demManifestPath: '',
      valhallaUrl: 'http://127.0.0.1:1',
      graphVersion: 'http-test-osm',
      coverage: [[84.8, 56.4, 85.2, 56.6]],
      fetcher: async (_input, options) => {
        if (routing === 'down') return new Response('unavailable', { status: 503 })
        const request = JSON.parse(String(options?.body)) as { locations: Position[] }
        if (request.locations.some((position) => position.lon > 85.1)) {
          return Response.json({ error_code: 171 }, { status: 400 })
        }
        const snapped = request.locations.map((position) => ({
          ...position, lat: position.lon === 85 ? position.lat + 0.0001 : position.lat,
        }))
        return Response.json({ trip: {
          status: 0, summary: { time: 120.6 }, legs: [{ shape: encodeShape(snapped) }],
        } })
      },
    },
  })
  await app.listen(0, '127.0.0.1')
  const result = { app, origin: await app.getUrl() }
  servers.push(result)
  return result
}

function send(method: Method, path: string, actor?: Actor, body?: object, options: {
  server?: Server; key?: string | false; csrf?: string; origin?: string; cookie?: string
} = {}): Promise<Response> {
  const headers = new Headers()
  if (actor || options.cookie) headers.set('cookie', options.cookie ?? actor?.cookie ?? '')
  if (method !== 'GET') {
    headers.set('origin', options.origin ?? browserOrigin)
    if (actor) headers.set('x-csrf-token', options.csrf ?? actor.csrf)
    if (options.key !== false) headers.set('idempotency-key', options.key ?? randomUUID())
  }
  if (body !== undefined) headers.set('content-type', 'application/json')
  return fetch(`${(options.server ?? server).origin}/api/v1${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function json<T>(response: Response, status: number): Promise<T> {
  expect(response.status, `${response.url}: ${response.status !== status ? await response.clone().text() : ''}`).toBe(status)
  expect(response.headers.get('cache-control')).toContain('no-store')
  return response.json() as Promise<T>
}

function cookie(response: Response, name: string): string {
  const value = response.headers.getSetCookie().find(item => item.startsWith(`${name}=`))?.split(';')[0]
  if (!value) throw new Error(`Expected cookie ${name}`)
  return value
}

async function actor(): Promise<Actor> {
  const email = `geo-${randomUUID()}@example.test`
  const registration = await send('POST', '/auth/register', undefined, { email, password, accepted_terms: true })
  expect(registration.status).toBe(202)
  const token = mail.find(item => item.email === email)?.token
  const registrationCookie = cookie(registration, 'tropio_registration')
  const verified = await send('POST', '/auth/verify-email', undefined, { token }, { cookie: registrationCookie })
  expect(verified.status).toBe(204)
  const loggedIn = await send('POST', '/auth/login', undefined, { email, password })
  const profile = await json<{ id: string; csrf_token: string }>(loggedIn, 200)
  return { id: profile.id, csrf: profile.csrf_token, cookie: cookie(loggedIn, 'tropio_session') }
}

async function trip(actor: Actor): Promise<Trip> {
  const draft = await json<Trip>(await send('POST', '/trips', actor, { title: 'Поездка на Томи' }), 201)
  return json<Trip>(await send('PUT', `/days/${draft.days[0]!.day_id}/route`, actor, {
    trip_revision_id: draft.trip_revision_id,
  }), 200)
}

function codes(schema: ContractSchema): string[] {
  return [
    ...(schema.properties?.code?.const ? [schema.properties.code.const] : []),
    ...(schema.properties?.code?.enum ?? []),
    ...(schema.allOf ?? []).flatMap(codes),
    ...(schema.oneOf ?? []).flatMap(codes),
  ]
}

function declaredErrors(): string[] {
  return Object.entries(contract.paths).flatMap(([path, operations]) =>
    Object.entries(operations).flatMap(([method, operation]) => operation?.tags?.includes('Geo')
      ? Object.entries(operation.responses).filter(([status]) => Number(status) >= 400).flatMap(([status, response]) => {
        const schema = contract.components.responses[response.$ref?.split('/').at(-1) ?? '']?.content['application/problem+json']?.schema
        if (!schema) throw new Error(`Missing error schema for ${method} ${path} ${status}`)
        return codes(schema).map(code => `${method.toUpperCase()} ${path} ${status} ${code}`)
      }) : []),
  )
}

async function problem(response: Response, method: Method, path: string, status: number, code: string) {
  const schemaRef = contract.paths[path]?.[method.toLowerCase() as Lowercase<Method>]?.responses[status]?.$ref
  const schema = contract.components.responses[schemaRef?.split('/').at(-1) ?? '']
    ?.content['application/problem+json']?.schema
  expect(schema && codes(schema), `${method} ${path} ${status}`).toContain(code)
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json(?:;|$)/)
  const actual = await json<{ status: number; code: string; type: string; title: string; request_id: string;
    current_route_revision_id?: string; current_poi_revision_id?: string }>(response, status)
  expect(actual).toMatchObject({ status, code, type: `urn:tropio:problem:${code.toLowerCase()}`,
    title: expect.any(String), request_id: expect.stringMatching(uuidFormat) })
  expect(actual.request_id).toBe(response.headers.get('x-request-id'))
  expect(Object.keys(actual).sort()).toEqual(['code', 'request_id', 'status', 'title', 'type',
    ...(actual.current_route_revision_id ? ['current_route_revision_id'] : []),
    ...(actual.current_poi_revision_id ? ['current_poi_revision_id'] : []),
  ].sort())
  seen.add(`${method} ${path} ${status} ${code}`)
  return actual
}

function draftBody(points: Position[], transports: ('car' | 'foot' | 'bicycle')[], revision: string | null = null) {
  return {
    route_revision_id: revision,
    points: points.map(position => ({ position })),
    tracks: transports.map(transport_mode => ({
      transport_mode, build_mode: transport_mode === 'foot' ? 'straight' : 'automatic',
    })),
  }
}

function routePath(draft: Trip): string {
  return `/routes/${draft.days[0]!.route_id}`
}

async function createPoi(actor: Actor, visibility: 'private' | 'global' | 'trip', scopeTrip?: string) {
  return json<Poi>(await send('POST', '/pois', actor, {
    category_id: categoryId, name: 'Вид на Томь', position: positions[0], visibility,
    ...(scopeTrip ? { scope_trip_id: scopeTrip } : {}),
  }), 201)
}

async function approve(poi: Poi) {
  return json<{ poi_revision_id: string }>(await send('POST', `/pois/${poi.poi_id}/moderation`, moderator, {
    decision: 'approved', poi_revision_id: poi.poi_revision_id,
  }), 200)
}

beforeAll(async () => {
  const identityUrl = process.env.TROPIO_IDENTITY_TEST_DATABASE_URL
  const travelUrl = process.env.TROPIO_TRAVEL_TEST_DATABASE_URL
  const geoUrl = process.env.TROPIO_GEO_TEST_DATABASE_URL
  if (!identityUrl || !travelUrl || !geoUrl) throw new Error('Use pnpm db:test:geo to provision the three database roles')
  identityPool = new pg.Pool({ connectionString: identityUrl })
  geoPool = new pg.Pool({ connectionString: geoUrl })
  server = await start(geoUrl, identityUrl, travelUrl)
  unavailable = await start('postgresql://127.0.0.1:1/unavailable', identityUrl, travelUrl, 'down')
  owner = await actor()
  visitor = await actor()
  moderator = await actor()
  await identityPool.query('INSERT INTO identity.user_roles (user_id, role_code) VALUES ($1, $2)', [moderator.id, 'poi_moderator'])
  ownerTrip = await trip(owner)
  visitorTrip = await trip(visitor)
  const categories = await json<{ items: { category_id: string }[] }>(await send('GET', '/poi-categories'), 200)
  categoryId = categories.items[0]!.category_id
}, 30_000)

afterAll(async () => {
  await Promise.all(servers.map(({ app }) => app.close()))
  await Promise.all([identityPool?.end(), geoPool?.end()])
})

describe('GIS-04 through the BFF', () => {
  it('AT-01 saves an ordered auto → auto → straight foot route', async () => {
    const path = routePath(ownerTrip)
    const empty = await json<Route>(await send('GET', path, owner), 200)
    expect(empty).toMatchObject({ route_revision_id: null, points: [], tracks: [], trip_type: null })
    const built = await json<Route>(await send('PUT', path, owner, draftBody([...positions], ['car', 'car', 'foot'])), 200)
    expect(built.trip_type).toBe('combined')
    expect(built.points).toHaveLength(4)
    expect(built.tracks.map(track => [track.build_mode, track.transport_mode, track.status])).toEqual([
      ['automatic', 'car', 'ready'], ['automatic', 'car', 'ready'], ['straight', 'foot', 'ready'],
    ])
    expect(built.tracks.map(track => track.estimated_duration_s)).toEqual([121, 121, undefined])
    for (const [index, track] of built.tracks.entries()) {
      expect(track.start_point_id).toBe(built.points[index]!.point_id)
      expect(track.end_point_id).toBe(built.points[index + 1]!.point_id)
      expect(track.distance_m).toBeGreaterThan(0)
    }
    const hidden = await problem(await send('GET', path, visitor), 'GET', '/routes/{routeId}', 404, 'NOT_FOUND')
    expect(hidden.current_route_revision_id).toBeUndefined()
  })

  it('AT-02 splits twice, replays the original result, preserves the previous revision and writes one event per split', async () => {
    const draft = await trip(owner)
    const path = routePath(draft)
    const original = await json<Route>(await send('PUT', path, owner, draftBody([positions[0], positions[3]], ['foot'])), 200)
    const firstTrack = original.tracks[0]!
    const route_id = original.route_id
    const splitPath = `/tracks/${firstTrack.track_id}/split`
    const key = randomUUID()
    const body = { route_id, route_revision_id: original.route_revision_id, split_position: { lon: 84.95, lat: 56.48 } }
    const first = await json<{ track_ids: string[]; route_revision_id: string }>(
      await send('POST', splitPath, owner, body, { key }), 200,
    )
    expect(first.track_ids).toHaveLength(2)
    const second = await json<{ track_ids: string[]; route_revision_id: string }>(
      await send('POST', `/tracks/${first.track_ids[0]}/split`, owner, {
        route_id, route_revision_id: first.route_revision_id, split_position: { lon: 84.945, lat: 56.48 },
      }), 200,
    )
    const current = await json<Route>(await send('GET', path, owner), 200)
    expect(current.points).toHaveLength(4)
    expect(current.tracks).toHaveLength(3)
    expect(await json(await send('POST', splitPath, owner, body, { key }), 200)).toEqual(first)
    await problem(await send('POST', splitPath, owner, { ...body, split_position: positions[1] }, { key }),
      'POST', '/tracks/{trackId}/split', 409, 'IDEMPOTENCY_KEY_REUSED')
    await problem(await send('POST', `/tracks/${second.track_ids[0]}/split`, owner, {
      route_id, route_revision_id: second.route_revision_id, split_position: positions[0],
    }), 'POST', '/tracks/{trackId}/split', 422, 'INVALID_SPLIT_POSITION')

    const { rows } = await geoPool.query<{ envelope: Buffer }>('SELECT envelope FROM geo.outbox_events WHERE aggregate_id = $1', [route_id])
    expect(rows).toHaveLength(2)
    for (const { envelope } of rows) {
      const value = JSON.parse(envelope.toString())
      expect(value).toMatchObject({ event_type: 'route.track.split', producer: 'geo', aggregate_id: route_id })
    }
    const restored = await json<Route>(await send('POST', `${path}/restore`, owner, {
      route_revision_id: current.route_revision_id, target_revision_id: original.route_revision_id,
    }), 200)
    expect(restored.route_revision_id).not.toBe(original.route_revision_id)
    expect(restored.tracks).toEqual(original.tracks)
  })

  it('replaces a day route with an empty revision and restores its points and tracks', async () => {
    const draft = await trip(owner)
    const path = routePath(draft)
    const original = await json<Route>(await send('PUT', path, owner, draftBody(positions.slice(0, 2), ['foot'])), 200)
    const cleared = await json<Route>(await send('PUT', path, owner, {
      route_revision_id: original.route_revision_id, points: [], tracks: [],
    }), 200)

    expect(cleared.route_id).toBe(original.route_id)
    expect(cleared.route_revision_id).not.toBe(original.route_revision_id)
    expect(cleared.points).toEqual([])
    expect(cleared.tracks).toEqual([])
    expect(await json<Route>(await send('GET', path, owner), 200)).toEqual(cleared)

    const restored = await json<Route>(await send('POST', `${path}/restore`, owner, {
      route_revision_id: cleared.route_revision_id, target_revision_id: original.route_revision_id,
    }), 200)
    expect(restored.points).toEqual(original.points)
    expect(restored.tracks).toEqual(original.tracks)
  })

  it('AT-03 preserves an off-network requested point and explicitly offers a manual continuation', async () => {
    const payload = { from: positions[0], to: { lon: 85.15, lat: 56.48 }, transport_mode: 'car' }
    const result = await json<{ status: string; reason?: string; to: { requested: Position }; alternatives: { build_mode: string }[] }>(
      await send('POST', '/routing/calculate', owner, payload), 200,
    )
    expect(result).toMatchObject({ status: 'unavailable', reason: 'no_edge', to: { requested: payload.to } })
    expect(result.alternatives).toEqual(expect.arrayContaining([expect.objectContaining({ build_mode: 'straight' })]))
    await problem(await send('POST', '/routing/calculate', owner, { ...payload, to: positions[1] }, { server: unavailable }),
      'POST', '/routing/calculate', 503, 'DEPENDENCY_UNAVAILABLE')

    const path = routePath(await trip(owner))
    const contractPath = '/routes/{routeId}'
    const requestedEnd = { lon: 85, lat: 56.48 }
    const available = await json<{ graph_version: string; from: { snapped: Position }; to: { snapped: Position };
      alternatives: { build_mode: string; connection?: string; geometry: number[][] }[] }>(
      await send('POST', '/routing/calculate', owner, { ...payload, to: requestedEnd }), 200,
    )
    expect(available.alternatives).toEqual(expect.arrayContaining([expect.objectContaining({
      build_mode: 'straight', connection: 'snapped_finish',
      geometry: [[available.to.snapped.lon, available.to.snapped.lat], [requestedEnd.lon, requestedEnd.lat]],
    })]))
    const body = draftBody([positions[0], requestedEnd], ['car'])
    await problem(await send('PUT', path, owner, body), 'PUT', contractPath, 422, 'SNAP_CONFIRMATION_REQUIRED')
    const confirmSnap = (graph_version: string, to: Position) => ({ ...body, tracks: [{
      ...body.tracks[0], confirm_snap: { from: available.from.snapped, to, graph_version },
    }] })
    await problem(await send('PUT', path, owner, confirmSnap('outdated', available.to.snapped)),
      'PUT', contractPath, 422, 'SNAP_CONFIRMATION_REQUIRED')
    await problem(await send('PUT', path, owner, confirmSnap(available.graph_version, requestedEnd)),
      'PUT', contractPath, 422, 'SNAP_CONFIRMATION_REQUIRED')
    const saved = await json<Route>(await send('PUT', path, owner,
      confirmSnap(available.graph_version, available.to.snapped)), 200)
    expect(saved.points[1]).toMatchObject({ position: available.to.snapped, requested_position: requestedEnd,
      snapped_position: available.to.snapped })
  })

  it('AT-04 moves a shared point and connects each affected track to the new location', async () => {
    const path = routePath(await trip(owner))
    const base = await json<Route>(await send('PUT', path, owner, draftBody([...positions.slice(0, 3)], ['car', 'car'])), 200)
    const moved = { lon: 84.946, lat: 56.481 }
    const body = {
      route_revision_id: base.route_revision_id,
      points: base.points.map((point, index) => ({ point_id: point.point_id, position: index === 1 ? moved : point.position })),
      tracks: base.tracks.map((track) => ({ track_id: track.track_id, build_mode: track.build_mode, transport_mode: track.transport_mode })),
    }
    const edited = await json<Route>(await send('PUT', path, owner, body), 200)
    expect(edited.points[1]?.position).toEqual(moved)
    expect(edited.tracks[0]?.geometry.coordinates.at(-1)).toEqual([moved.lon, moved.lat])
    expect(edited.tracks[1]?.geometry.coordinates[0]).toEqual([moved.lon, moved.lat])
    const conflict = await problem(await send('PUT', path, owner, body), 'PUT', '/routes/{routeId}', 409, 'ROUTE_REVISION_CONFLICT')
    expect(conflict.current_route_revision_id).toBe(edited.route_revision_id)
  })

  it('AT-05 links one approved POI to multiple trips, while pending POI are absent from global', async () => {
    const poi = await createPoi(owner, 'global')
    const id = poi.poi_id
    await problem(await send('GET', `/pois/${id}`), 'GET', '/pois/{poiId}', 404, 'NOT_FOUND')
    const pendingList = await json<{ items: Poi[] }>(await send('GET', '/pois?scope=global', owner), 200)
    expect(pendingList.items.map(item => item.poi_id)).not.toContain(id)
    await approve(poi)
    expect((await json<Poi>(await send('GET', `/pois/${id}`), 200)).poi_id).toBe(id)
    for (const [editor, draft] of [[owner, ownerTrip], [visitor, visitorTrip]] as const) {
      const attach = `/trips/${draft.trip_id}/pois/${id}`
      const key = randomUUID()
      expect((await send('PUT', attach, editor, undefined, { key })).status).toBe(204)
      expect((await send('PUT', attach, editor, undefined, { key })).status).toBe(204)
      const page = await json<{ items: Poi[] }>(await send('GET', `/pois?scope=trip&trip_id=${draft.trip_id}`, editor), 200)
      expect(page.items.map(item => item.poi_id)).toEqual([id])
    }
    expect((await geoPool.query('SELECT id FROM geo.pois WHERE id = $1', [id])).rowCount).toBe(1)
    expect((await geoPool.query('SELECT 1 FROM geo.trip_pois WHERE poi_id = $1', [id])).rowCount).toBe(2)

    const placeInTrip = await createPoi(owner, 'trip', ownerTrip.trip_id)
    const page = await json<{ items: Poi[] }>(await send('GET', `/pois?scope=trip&trip_id=${ownerTrip.trip_id}`, owner), 200)
    expect(page.items.map(item => item.poi_id)).toContain(placeInTrip.poi_id)
  })

  it('AT-06 hides closed POI and all dependent geometry from another route owner', async () => {
    const poi = await createPoi(owner, 'global')
    const approved = await approve(poi)
    const path = routePath(visitorTrip)
    const key = randomUUID()
    const route = {
      route_revision_id: null,
      points: [{ position: positions[0], poi_id: poi.poi_id }, { position: positions[3] }],
      tracks: [{ build_mode: 'straight', transport_mode: 'foot' }],
    }
    const draft = await json<Route>(await send('PUT', path, visitor, route, { key }), 200)
    const poiPath = `/pois/${poi.poi_id}`
    const attach = `/trips/${visitorTrip.trip_id}/pois/${poi.poi_id}`
    expect((await send('PUT', attach, visitor)).status).toBe(204)

    const mediaId = randomUUID()
    const mediaPath = `${poiPath}/media/${mediaId}`
    await geoPool.query(`INSERT INTO geo.poi_media (id, poi_id, object_key, media_type, moderation_status, position)
      VALUES ($1,$2,'test.png','image/png','approved',0)`, [mediaId, poi.poi_id])
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/b5kAAAAASUVORK5CYII=', 'base64')
    let mediaGets = 0
    const storage = createServer((request, response) => {
      if (!request.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ') || request.url !== '/tropio-media/test.png') {
        response.writeHead(403).end()
        return
      }
      mediaGets++
      response.writeHead(200, { 'Content-Type': 'image/png' }).end(png)
    })
    await new Promise<void>(resolve => storage.listen(0, '127.0.0.1', resolve))
    const address = storage.address()
    if (!address || typeof address === 'string') throw new Error('Missing storage port')
    vi.stubEnv('TROPIO_S3_URL', `http://127.0.0.1:${address.port}`)
    vi.stubEnv('TROPIO_S3_BUCKET', 'tropio-media')
    vi.stubEnv('TROPIO_S3_ACCESS_KEY_ID', 'test-key')
    vi.stubEnv('TROPIO_S3_SECRET_ACCESS_KEY', 'test-secret')

    let closed: { poi_revision_id: string }
    try {
      const media = await send('GET', mediaPath, visitor)
      expect(media.status).toBe(200)
      expect(media.headers.get('content-type')).toBe('image/png')
      expect(Buffer.from(await media.arrayBuffer())).toEqual(png)
      closed = await json(await send('PATCH', `${poiPath}/visibility`, owner, {
        poi_revision_id: approved.poi_revision_id, visibility: 'private',
      }), 200)
      await problem(await send('GET', mediaPath, visitor), 'GET', '/pois/{poiId}/media/{mediaId}', 404, 'NOT_FOUND')
      expect(mediaGets).toBe(1)
    } finally {
      vi.unstubAllEnvs()
      await new Promise<void>(resolve => storage.close(() => resolve()))
    }

    await problem(await send('GET', poiPath, visitor), 'GET', '/pois/{poiId}', 404, 'NOT_FOUND')
    await problem(await send('PUT', attach, visitor), 'PUT', '/trips/{tripId}/pois/{poiId}', 404, 'NOT_FOUND')
    for (const query of ['scope=global&q=Томь', `scope=trip&trip_id=${visitorTrip.trip_id}`]) {
      const page = await json<{ items: Poi[] }>(await send('GET', `/pois?${query}`, visitor), 200)
      expect(page.items.map(item => item.poi_id)).not.toContain(poi.poi_id)
    }
    expect(await json<Route>(await send('GET', path, visitor), 200)).toEqual({
      availability: 'geometry_restricted', route_id: draft.route_id, route_revision_id: draft.route_revision_id,
    })
    await problem(await send('PUT', path, visitor, route, { key }),
      'PUT', '/routes/{routeId}', 422, 'ROUTE_GEOMETRY_RESTRICTED')
    await problem(await send('POST', `/tracks/${draft.tracks[0]!.track_id}/split`, visitor, {
      route_id: draft.route_id, route_revision_id: draft.route_revision_id, split_position: positions[1],
    }), 'POST', '/tracks/{trackId}/split', 422, 'ROUTE_GEOMETRY_RESTRICTED')
    expect((await send('GET', poiPath, owner)).status).toBe(200)
    const published = await json<{ poi_revision_id: string }>(await send('PATCH', `${poiPath}/visibility`, owner, {
      poi_revision_id: closed.poi_revision_id, visibility: 'global',
    }), 200)
    const moved = await json<Poi>(await send('PATCH', poiPath, owner, {
      poi_revision_id: published.poi_revision_id, position: positions[1],
    }), 200)
    await approve(moved)
    expect(await json(await send('GET', poiPath, visitor), 200)).toMatchObject({ position: positions[1] })
    await problem(await send('POST', `${path}/restore`, visitor, {
      route_revision_id: draft.route_revision_id, target_revision_id: draft.route_revision_id,
    }), 'POST', '/routes/{routeId}/restore', 422, 'ROUTE_GEOMETRY_RESTRICTED')
  })

  it.runIf(process.env.TROPIO_GEO_PILOT_CHECK === '1')('saves and rereads a Valhalla track with the real Copernicus profile', async () => {
    const pilot = await start(process.env.TROPIO_GEO_TEST_DATABASE_URL!, process.env.TROPIO_IDENTITY_TEST_DATABASE_URL!,
      process.env.TROPIO_TRAVEL_TEST_DATABASE_URL!, 'pilot')
    const from = { lon: 84.95, lat: 56.4846 }
    const to = { lon: 84.9514, lat: 56.4846 }
    const preview = await json<{ status: string; graph_version: string; duration_s: number;
      from: { snapped: Position }; to: { snapped: Position }; elevation_profile: Track['elevation_profile'] }>(
      await send('POST', '/routing/calculate', owner, { from, to, transport_mode: 'car' }, { server: pilot }), 200,
    )
    expect(preview.status).toBe('available')
    expect(preview.elevation_profile).toMatchObject({ source: 'copernicus-dem-glo-30-public', vertical_datum: 'EGM2008' })
    expect(preview.elevation_profile?.profile.length).toBeGreaterThan(2)
    expect(preview.elevation_profile?.profile.every(item => item.elevation_m !== null)).toBe(true)
    const path = routePath(await trip(owner))
    const body = draftBody([from, to], ['car'])
    const saved = await json<Route>(await send('PUT', path, owner, { ...body, tracks: [{ ...body.tracks[0],
      confirm_snap: { from: preview.from.snapped, to: preview.to.snapped, graph_version: preview.graph_version },
    }] }, { server: pilot }), 200)
    expect(saved.tracks[0]?.estimated_duration_s).toBe(Math.round(preview.duration_s))
    expect(saved.tracks[0]?.elevation_profile).toEqual(preview.elevation_profile)
    expect(await json(await send('GET', path, owner, undefined, { server: pilot }), 200)).toEqual(saved)
  })

  it('validates input, session, Origin, visibility and dependency failures for every Geo operation', async () => {
    const path = routePath(await trip(owner))
    const valid = draftBody([positions[0], positions[3]], ['foot'])
    const route = await json<Route>(await send('PUT', path, owner, valid), 200)
    const routeId = route.route_id
    const routeRevision = route.route_revision_id
    const place = await createPoi(owner, 'private')
    const global = await createPoi(owner, 'global')
    const poi = `/pois/${place.poi_id}`
    const poiBody = { poi_revision_id: place.poi_revision_id }
    const preview = { from: positions[0], to: positions[1], transport_mode: 'car' }
    const create = { category_id: categoryId, name: 'Посёлок', position: positions[0], visibility: 'private' }
    const operations: ErrorProbe[] = [
      { method: 'GET', path: '/routes/{routeId}', endpoint: path, actor: owner, foreignActor: visitor, badEndpoint: '/routes/bad' },
      { method: 'PUT', path: '/routes/{routeId}', endpoint: path, actor: owner, foreignActor: visitor, body: valid },
      { method: 'POST', path: '/routes/{routeId}/restore', endpoint: `${path}/restore`, actor: owner, foreignActor: visitor,
        body: { route_revision_id: routeRevision, target_revision_id: routeRevision } },
      { method: 'POST', path: '/tracks/{trackId}/split', endpoint: `/tracks/${route.tracks[0]!.track_id}/split`,
        actor: owner, foreignActor: visitor, body: { route_id: routeId, route_revision_id: routeRevision, split_position: positions[1] } },
      { method: 'POST', path: '/routing/calculate', endpoint: '/routing/calculate', actor: owner, body: preview },
      { method: 'GET', path: '/poi-categories', endpoint: '/poi-categories' },
      { method: 'GET', path: '/pois', endpoint: `/pois?scope=trip&trip_id=${ownerTrip.trip_id}`,
        actor: owner, foreignActor: visitor, badEndpoint: '/pois?scope=bad' },
      { method: 'POST', path: '/pois', endpoint: '/pois', actor: owner, body: create },
      { method: 'GET', path: '/pois/{poiId}', endpoint: poi, actor: owner, foreignActor: visitor, badEndpoint: '/pois/bad' },
      { method: 'PATCH', path: '/pois/{poiId}', endpoint: poi, actor: owner, foreignActor: visitor, body: { ...poiBody, name: 'Водопад' } },
      { method: 'DELETE', path: '/pois/{poiId}', endpoint: poi, actor: owner, foreignActor: visitor, body: poiBody },
      { method: 'PATCH', path: '/pois/{poiId}/visibility', endpoint: `${poi}/visibility`, actor: owner, foreignActor: visitor,
        body: { ...poiBody, visibility: 'global' } },
      { method: 'POST', path: '/pois/{poiId}/moderation', endpoint: `/pois/${global.poi_id}/moderation`, actor: moderator,
        foreignActor: visitor, body: { poi_revision_id: global.poi_revision_id, decision: 'approved' } },
      { method: 'PUT', path: '/trips/{tripId}/pois/{poiId}', endpoint: `/trips/${ownerTrip.trip_id}/pois/${place.poi_id}`,
        actor: owner, foreignActor: visitor },
      { method: 'GET', path: '/pois/{poiId}/media/{mediaId}', endpoint: `${poi}/media/${randomUUID()}`,
        actor: owner, foreignActor: visitor, badEndpoint: `${poi}/media/bad` },
    ]
    for (const { method, path, endpoint, actor, body, badEndpoint, foreignActor } of operations) {
      const check = (response: Promise<Response>, status: number, code: string) => response.then(result =>
        problem(result, method, path, status, code))
      await check(send(method, endpoint, actor, body, { server: unavailable }), 503, 'DEPENDENCY_UNAVAILABLE')
      if (foreignActor) await check(send(method, endpoint, foreignActor, body), 404, 'NOT_FOUND')
      if (badEndpoint) await check(send(method, badEndpoint, actor), 400, 'INVALID_REQUEST')
      if (actor && (method !== 'GET' || path === '/routes/{routeId}' || path === '/pois')) {
        await check(send(method, endpoint, undefined, body), 401, 'SESSION_REQUIRED')
      }
      if (method !== 'GET') {
        await check(send(method, endpoint, actor, body, { origin: 'https://invalid.example' }), 403, 'CSRF_REJECTED')
        if (path === '/routing/calculate') await check(send(method, endpoint, actor, {}), 400, 'INVALID_REQUEST')
        else await check(send(method, endpoint, actor, body, { key: false }), 400, 'INVALID_REQUEST')
      }
    }
    await problem(await send('PUT', path, owner, { ...valid, extra: 'x'.repeat(256 * 1024) }),
      'PUT', '/routes/{routeId}', 400, 'INVALID_REQUEST')
  })

  it('checks every declared semantic error, including a concurrent route revision and POI receipts', async () => {
    const path = routePath(await trip(owner))
    const routeApi = '/routes/{routeId}'
    const valid = draftBody([positions[0], positions[3]], ['foot'])
    await problem(await send('PUT', path, owner, { ...valid, tracks: [] }), 'PUT', routeApi, 422, 'INVALID_ROUTE_TOPOLOGY')
    const impossible = draftBody([positions[0], { lon: 85.15, lat: 56.48 }], ['car'])
    await problem(await send('PUT', path, owner, impossible), 'PUT', routeApi, 422, 'ROUTE_BUILD_UNAVAILABLE')
    const legitimate = await createPoi(owner, 'trip', ownerTrip.trip_id)
    const foreignScope = { ...valid, points: [{ position: positions[0], poi_id: legitimate.poi_id }, valid.points[1]] }
    await problem(await send('PUT', path, owner, foreignScope), 'PUT', routeApi, 422, 'POI_SCOPE_RESTRICTED')

    const key = randomUUID()
    const sibling = randomUUID()
    const responses = await Promise.all([send('PUT', path, owner, valid, { key }), send('PUT', path, owner, valid, { key: sibling })])
    const winner = responses.findIndex(response => response.status === 200)
    expect(winner).toBeGreaterThanOrEqual(0)
    const route = await json<Route>(responses[winner]!, 200)
    const conflict = await problem(responses[1 - winner]!, 'PUT', routeApi, 409, 'ROUTE_REVISION_CONFLICT')
    expect(conflict.current_route_revision_id).toBe(route.route_revision_id)
    const winnerKey = winner === 0 ? key : sibling
    await problem(await send('PUT', path, owner, { ...valid, points: [{ position: positions[1] }, valid.points[1]] }, { key: winnerKey }),
      'PUT', routeApi, 409, 'IDEMPOTENCY_KEY_REUSED')
    const stale = randomUUID()
    await problem(await send('POST', `/tracks/${route.tracks[0]!.track_id}/split`, owner, {
      route_id: route.route_id, route_revision_id: stale, split_position: positions[1],
    }), 'POST', '/tracks/{trackId}/split', 409, 'ROUTE_REVISION_CONFLICT')
    const restore = { route_revision_id: route.route_revision_id, target_revision_id: route.route_revision_id }
    const restoreApi = '/routes/{routeId}/restore'
    await problem(await send('POST', `${path}/restore`, owner, { ...restore, route_revision_id: stale }),
      'POST', restoreApi, 409, 'ROUTE_REVISION_CONFLICT')
    await problem(await send('POST', `${path}/restore`, owner, restore, { key: winnerKey }),
      'POST', restoreApi, 409, 'IDEMPOTENCY_KEY_REUSED')

    const createApi = '/pois'
    const poiApi = '/pois/{poiId}'
    const visibilityApi = `${poiApi}/visibility`
    const moderationApi = `${poiApi}/moderation`
    const createBody = { category_id: categoryId, name: 'Черновик POI', position: positions[0], visibility: 'global' }
    await problem(await send('POST', '/pois', owner, { ...createBody, category_id: stale }),
      'POST', createApi, 422, 'INVALID_POI_CATEGORY')
    const deniedScope = { visibility: 'trip', scope_trip_id: visitorTrip.trip_id }
    await problem(await send('POST', '/pois', owner, { ...createBody, ...deniedScope }),
      'POST', createApi, 422, 'POI_SCOPE_RESTRICTED')
    const createKey = randomUUID()
    const poi = await json<Poi>(await send('POST', '/pois', owner, createBody, { key: createKey }), 201)
    await problem(await send('POST', '/pois', owner, { ...createBody, name: 'Другое место' }, { key: createKey }),
      'POST', createApi, 409, 'IDEMPOTENCY_KEY_REUSED')
    const item = `/pois/${poi.poi_id}`
    await problem(await send('PATCH', item, owner, { poi_revision_id: poi.poi_revision_id, category_id: stale }),
      'PATCH', poiApi, 422, 'INVALID_POI_CATEGORY')
    await problem(await send('PATCH', `${item}/visibility`, owner, { poi_revision_id: poi.poi_revision_id, ...deniedScope }),
      'PATCH', visibilityApi, 422, 'POI_SCOPE_RESTRICTED')
    await problem(await send('PUT', `/trips/${(await trip(owner)).trip_id}/pois/${legitimate.poi_id}`, owner),
      'PUT', '/trips/{tripId}/pois/{poiId}', 422, 'POI_SCOPE_RESTRICTED')

    let revision = poi.poi_revision_id
    const mutations = [
      { endpoint: item, api: poiApi, actor: owner, values: { name: 'Обновлено' }, diff: { name: 'Различие' } },
      { endpoint: `${item}/moderation`, api: moderationApi, actor: moderator, values: { decision: 'approved' }, diff: { decision: 'rejected' } },
      { endpoint: `${item}/visibility`, api: visibilityApi, actor: owner, values: { visibility: 'private' }, diff: { visibility: 'global' } },
    ]
    for (const mutation of mutations) {
      const method = mutation.actor === moderator ? 'POST' : 'PATCH'
      const options = { key: randomUUID() }
      const change = { poi_revision_id: revision, ...mutation.values }
      const conflict = await problem(await send(method, mutation.endpoint, mutation.actor, { ...change, poi_revision_id: stale }),
        method, mutation.api, 409, 'POI_REVISION_CONFLICT')
      expect(conflict.current_poi_revision_id).toBe(mutation.actor === moderator ? undefined : revision)
      revision = (await json<Poi>(await send(method, mutation.endpoint, mutation.actor, change, options), 200)).poi_revision_id
      await problem(await send(method, mutation.endpoint, mutation.actor, { ...change, ...mutation.diff }, options),
        method, mutation.api, 409, 'IDEMPOTENCY_KEY_REUSED')
    }
    const deleteKey = randomUUID()
    await problem(await send('DELETE', item, owner, { poi_revision_id: stale }, { key: deleteKey }),
      'DELETE', poiApi, 409, 'POI_REVISION_CONFLICT')
    expect((await send('DELETE', item, owner, { poi_revision_id: revision }, { key: deleteKey })).status).toBe(204)
    await problem(await send('DELETE', item, owner, { poi_revision_id: stale }, { key: deleteKey }),
      'DELETE', poiApi, 409, 'IDEMPOTENCY_KEY_REUSED')
    await problem(await send('POST', '/pois', owner, createBody, { key: createKey }), 'POST', createApi, 404, 'NOT_FOUND')
    expect([...seen].sort()).toEqual(declaredErrors().sort())
  })
})
