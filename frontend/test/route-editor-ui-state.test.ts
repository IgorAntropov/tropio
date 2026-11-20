import { afterEach, expect, it, vi } from 'vitest'
import { useRouteEditor } from '../src/features/edit-route'
import type { ReadableRouteDraft, RouteTrackPreview } from '../src/shared/api'

vi.mock('@fsd/shared/api', () => import('../src/shared/api'))

const first = { lon: 84.95, lat: 56.48 }
const last = { lon: 84.96, lat: 56.49 }
const next = { lon: 84.97, lat: 56.50 }
const routeId = 'b79178cb-280c-48df-99fc-ecc0647ae408'
const oldRevision = '555c0433-dd9f-4a90-b03d-93e42278da76'
const newRevision = 'b55650d6-dd81-4912-9d5e-978cbe628836'
const newerRevision = '4dc570fa-7245-4d2b-89f3-067768b5d6d5'
const startId = 'a46820ac-82f4-46c2-b2bc-4720b2d9869d'
const endId = 'f5646e29-7391-44f9-b87d-6b1ed75cb8bf'
const trackId = 'fec1ef98-671f-407c-b9da-a3d9d92118d6'

function route(revision: string, name?: string): ReadableRouteDraft {
  return {
    availability: 'available',
    route_id: routeId,
    route_revision_id: revision,
    trip_type: 'foot',
    points: [
      { point_id: startId, position: first, name },
      { point_id: endId, position: last },
    ],
    tracks: [{
      track_id: trackId,
      start_point_id: startId,
      end_point_id: endId,
      transport_mode: 'foot',
      build_mode: 'straight',
      status: 'ready',
      geometry: { type: 'LineString', coordinates: [[first.lon, first.lat], [last.lon, last.lat]] },
      distance_m: 1256,
      ascent_m: null,
      descent_m: null,
      min_elevation_m: null,
      max_elevation_m: null,
    }],
  }
}

function editor() {
  return useRouteEditor(() => routeId, () => 'csrf')
}

function changeStart(model: ReturnType<typeof editor>) {
  return model.updatePoint({ id: startId, position: first, name: 'Мои правки', description: '' })
}

function routingPreview(
  requestedFrom: typeof first,
  from: typeof first,
  requestedTo: typeof first,
  to: typeof first,
): RouteTrackPreview {
  const geometry: RouteTrackPreview['geometry'] = [[from.lon, from.lat], [to.lon, to.lat]]
  return {
    status: 'available',
    from: { requested: requestedFrom, snapped: from, distance_m: requestedFrom === from ? 0 : 8 },
    to: { requested: requestedTo, snapped: to, distance_m: requestedTo === to ? 0 : 8 },
    geometry,
    distance_m: 1256,
    duration_s: 150,
    provider: 'valhalla',
    graph_version: 'pilot',
    alternatives: [{
      build_mode: 'straight',
      transport_mode: 'car',
      geometry: [[requestedFrom.lon, requestedFrom.lat], [requestedTo.lon, requestedTo.lat]],
      distance_m: 1000,
      duration_s: null,
      warning: 'unverified_passability',
    }],
  }
}

afterEach(() => vi.unstubAllGlobals())

it('marks the first track saved only after the server confirms it', async () => {
  const response = Promise.withResolvers<Response>()
  const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(response.promise)
  vi.stubGlobal('fetch', fetch)
  const model = editor()
  model.buildMode.value = 'straight'
  model.transportMode.value = 'foot'

  await model.add(first)
  expect(model.draft.value.points).toHaveLength(1)
  expect(fetch).not.toHaveBeenCalled()
  expect(model.status.value).toBe('idle')

  const saving = model.add(last)
  expect(model.status.value).toBe('saving')
  expect(model.changed.value).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0]?.[0]).toBe(`/api/v1/routes/${routeId}`)
  expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
    route_revision_id: null,
    points: [{ position: first }, { position: last }],
    tracks: [{ build_mode: 'straight', transport_mode: 'foot' }],
  }))

  response.resolve(Response.json(route(newRevision)))
  await saving
  expect(model.status.value).toBe('saved')
  expect(model.changed.value).toBe(false)
  expect(model.draft.value.points.map(point => point.point_id)).toEqual([startId, endId])
})

it('saves on the selected automatic mode when a previously confirmed endpoint is unchanged', async () => {
  const original = { lon: last.lon - 0.0001, lat: last.lat }
  const before = route(oldRevision)
  before.points[1] = { point_id: endId, position: last, requested_position: original, snapped_position: last }
  const previousTrack = { ...before.tracks[0]!, build_mode: 'automatic' } as const
  before.tracks = [previousTrack]
  const nextPointId = '8a14fad5-49d1-4605-af45-8fce2e84e6e0'
  const after: ReadableRouteDraft = {
    ...before,
    route_revision_id: newRevision,
    trip_type: 'combined',
    points: [...before.points, { point_id: nextPointId, position: next }],
    tracks: [previousTrack, {
      ...previousTrack,
      track_id: 'f93751af-e16b-4b03-bc98-7c979ea38520',
      start_point_id: endId,
      end_point_id: nextPointId,
      transport_mode: 'car',
      geometry: { type: 'LineString', coordinates: [[last.lon, last.lat], [next.lon, next.lat]] },
    }],
  }
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json(routingPreview(original, last, next, next)))
    .mockResolvedValueOnce(Response.json(after))
  vi.stubGlobal('fetch', fetch)
  const model = editor()
  model.resetDraft(before)

  await model.add(next)

  expect(model.preview.value).toBeNull()
  expect(model.buildMode.value).toBe('automatic')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
    from: original, to: next, build_mode: 'automatic', transport_mode: 'car',
  }))
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
    route_revision_id: oldRevision,
    tracks: [{ track_id: trackId, build_mode: 'automatic', transport_mode: 'foot' }, {
      build_mode: 'automatic', transport_mode: 'car',
      confirm_snap: { from: last, to: next, graph_version: 'pilot' },
    }],
  })
  expect(model.status.value).toBe('saved')
  expect(model.draft.value.points[1]).toMatchObject({ position: last, requested_position: original })
  expect(model.draft.value.tracks).toHaveLength(2)
})

it.each(['shifted', 'unavailable'])('asks for a decision when a new automatic route is %s', async (condition) => {
  const proposal = routingPreview(first, first, last, { lon: last.lon - 0.0001, lat: last.lat })
  const result = condition === 'shifted' ? proposal : {
    ...proposal, status: 'unavailable', geometry: null, reason: 'no_edge',
  }
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(result))
  vi.stubGlobal('fetch', fetch)
  const model = editor()
  await model.add(first)
  await model.add(last)

  expect(model.preview.value?.status).toBe(result.status)
  expect(model.preview.value?.alternatives).toHaveLength(1)
  expect(model.draft.value.points[1]?.position).toEqual(last)
  expect(fetch).toHaveBeenCalledOnce()
  model.cancelPreview()
  expect(model.draft.value.points.map(point => point.position)).toEqual([first])
})

it('clears a saved route in a new revision and keeps undo and redo available', async () => {
  const cleared = { ...route(newRevision), points: [], tracks: [], trip_type: null }
  const restored = route(newerRevision)
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json(cleared))
    .mockResolvedValueOnce(Response.json(restored))
    .mockResolvedValueOnce(Response.json(cleared))
  vi.stubGlobal('fetch', fetch)
  const model = editor()
  model.resetDraft(route(oldRevision))
  model.select({ type: 'track', id: trackId })

  await model.clearRoute()
  expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
    route_revision_id: oldRevision, points: [], tracks: [],
  }))
  expect(model.draft.value.points).toHaveLength(0)
  expect(model.draft.value.tracks).toHaveLength(0)
  expect(model.selection.value).toBeNull()
  expect(model.editing.value).toBe(false)
  expect(model.canUndo.value).toBe(true)

  await model.undo()
  expect(fetch.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({
    route_revision_id: newRevision, target_revision_id: oldRevision,
  }))
  expect(model.draft.value.tracks).toHaveLength(1)
  expect(model.canRedo.value).toBe(true)

  await model.redo()
  expect(fetch.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({
    route_revision_id: newerRevision, target_revision_id: newRevision,
  }))
  expect(model.draft.value.tracks).toHaveLength(0)
})

it('clears a single unsaved point without sending a command or leaving pending changes', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.stubGlobal('fetch', fetch)
  const model = editor()
  await model.add(first)
  expect(model.changed.value).toBe(true)

  await model.clearRoute()

  expect(fetch).not.toHaveBeenCalled()
  expect(model.status.value).toBe('idle')
  expect(model.changed.value).toBe(false)
  expect(model.draft.value.points).toHaveLength(0)
})

it('lets the timeline focus a selection without opening details', () => {
  const model = editor()
  model.resetDraft(route(oldRevision))
  const item = { type: 'point', id: startId } as const
  model.select(item, false)
  expect(model.selection.value).toEqual(item)
  expect(model.editing.value).toBe(false)
  model.select(item)
  expect(model.editing.value).toBe(true)
})

it('keeps an unsaved edit after a network failure and retries the exact same command', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(Response.json(route(newRevision, 'Мои правки')))
  vi.stubGlobal('fetch', fetch)
  const model = editor()
  model.resetDraft(route(oldRevision, 'Начало'))

  await changeStart(model)
  expect(model.status.value).toBe('offline')
  expect(model.changed.value).toBe(true)
  expect(model.issue.value).toContain('подключение к сети')
  expect(model.draft.value.points[0]?.name).toBe('Мои правки')
  expect(model.canUndo.value).toBe(false)

  await model.retry()
  const [, original] = fetch.mock.calls[0] ?? []
  const [, repeated] = fetch.mock.calls[1] ?? []
  const originalKey = new Headers(original?.headers).get('idempotency-key')
  expect(originalKey).toBeTruthy()
  expect(new Headers(repeated?.headers).get('idempotency-key')).toBe(originalKey)
  expect(repeated?.body).toBe(original?.body)
  expect(model.status.value).toBe('saved')
  expect(model.changed.value).toBe(false)
})

it('keeps local edits separate when a conflicting server revision is loaded and opened', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ code: 'ROUTE_REVISION_CONFLICT' }, { status: 409 }))
    .mockResolvedValueOnce(Response.json(route(newRevision, 'На сервере')))
  vi.stubGlobal('fetch', fetch)
  const model = editor()
  model.resetDraft(route(oldRevision, 'Начало'))

  await changeStart(model)
  expect(model.status.value).toBe('conflict')
  expect(model.changed.value).toBe(true)
  expect(model.draft.value.points[0]?.name).toBe('Мои правки')
  await model.retry()
  expect(fetch).toHaveBeenCalledTimes(1)

  await model.loadServer()
  expect(model.conflict.value?.status).toBe('ready')
  expect(model.conflict.value?.local?.points[0]?.name).toBe('Мои правки')
  expect(model.conflict.value?.server?.points[0]?.name).toBe('На сервере')

  model.useServer()
  expect(model.draft.value.points[0]?.name).toBe('На сервере')
  expect(model.localVersion.value?.points[0]?.name).toBe('Мои правки')
  model.keepLocal()
  expect(model.draft.value.points[0]?.name).toBe('Мои правки')
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('refreshes a rejected CSRF token without changing the command body or idempotency key', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ code: 'CSRF_REJECTED' }, { status: 403 }))
    .mockResolvedValueOnce(Response.json(route(newRevision, 'Мои правки')))
  const refreshCsrf = vi.fn(async () => 'rotated-csrf')
  vi.stubGlobal('fetch', fetch)
  const model = useRouteEditor(() => routeId, () => 'old-csrf', refreshCsrf)
  model.resetDraft(route(oldRevision))

  await changeStart(model)

  const [, original] = fetch.mock.calls[0] ?? []
  const [, repeated] = fetch.mock.calls[1] ?? []
  expect(refreshCsrf).toHaveBeenCalledOnce()
  expect(new Headers(original?.headers).get('x-csrf-token')).toBe('old-csrf')
  expect(new Headers(repeated?.headers).get('x-csrf-token')).toBe('rotated-csrf')
  const key = new Headers(original?.headers).get('idempotency-key')
  expect(key).toBeTruthy()
  expect(new Headers(repeated?.headers).get('idempotency-key')).toBe(key)
  expect(repeated?.body).toBe(original?.body)
  expect(model.status.value).toBe('saved')
})

it('compares the newest local work after a second conflict', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ code: 'ROUTE_REVISION_CONFLICT' }, { status: 409 }))
    .mockResolvedValueOnce(Response.json(route(newRevision, 'Сервер 1')))
    .mockResolvedValueOnce(Response.json({ code: 'ROUTE_REVISION_CONFLICT' }, { status: 409 }))
    .mockResolvedValueOnce(Response.json(route(newerRevision, 'Сервер 2')))
  vi.stubGlobal('fetch', fetch)
  const model = editor()
  model.resetDraft(route(oldRevision))

  await changeStart(model)
  await model.loadServer()
  model.useServer()
  expect(model.localVersion.value?.points[0]?.name).toBe('Мои правки')

  await model.updatePoint({ id: startId, position: first, name: 'Вторая правка', description: '' })
  await model.loadServer()
  expect(model.status.value).toBe('conflict')
  expect(model.conflict.value?.local?.points[0]?.name).toBe('Вторая правка')
  expect(model.conflict.value?.server?.points[0]?.name).toBe('Сервер 2')
})

it('removes displayed geometry and edit controls when access to a route dependency is revoked', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ code: 'ROUTE_GEOMETRY_RESTRICTED' }, { status: 422 }))
  vi.stubGlobal('fetch', fetch)
  const model = editor()
  model.resetDraft(route(oldRevision))

  await changeStart(model)

  expect(model.status.value).toBe('error')
  expect(model.readOnly.value).toBe(true)
  expect(model.draft.value.points).toHaveLength(0)
  expect(model.draft.value.tracks).toHaveLength(0)
  expect(model.changed.value).toBe(false)
  expect(model.canUndo.value).toBe(false)
  await model.retry()
  expect(fetch).toHaveBeenCalledOnce()
})
