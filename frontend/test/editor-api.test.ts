import { afterEach, expect, it, vi } from 'vitest'
import { editorApi } from '../src/shared/api'

afterEach(() => vi.unstubAllGlobals())

const uuid = '6933c278-1263-4f4e-a23e-d49572b0bc4d'
const requestId = 'df00de05-beed-4b42-99ec-8ed22349e49f'

it('encodes the request and surfaces a conflict without losing its revision or request ID', async () => {
  const response = Response.json({ status: 409, code: 'ROUTE_REVISION_CONFLICT', current_route_revision_id: uuid }, {
    status: 409, headers: { 'x-request-id': requestId },
  })
  const request = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', request)
  const signal = new AbortController().signal
  const snapshot = { route_revision_id: null, points: [], tracks: [] }

  await expect(editorApi.replaceRoute(uuid, snapshot, { csrf: 'csrf', key: uuid, signal })).rejects.toMatchObject({
    status: 409, code: 'ROUTE_REVISION_CONFLICT', requestId, currentRouteRevisionId: uuid,
  })
  expect(request).toHaveBeenCalledWith(`/api/v1/routes/${uuid}`, expect.objectContaining({
    body: JSON.stringify(snapshot), method: 'PUT', credentials: 'same-origin', cache: 'no-store', signal,
  }))
  expect(new Headers(request.mock.calls[0]?.[1]?.headers).get('idempotency-key')).toBe(uuid)
  expect(new Headers(request.mock.calls[0]?.[1]?.headers).get('x-csrf-token')).toBe('csrf')
})

it('preserves network failures and sends the POI bounding box as one form parameter', async () => {
  const network = new TypeError('Network is unavailable')
  const request = vi.fn<typeof fetch>().mockRejectedValue(network)
  vi.stubGlobal('fetch', request)
  await expect(editorApi.listPois({ scope: 'trip', trip_id: uuid, bbox: [84, 56, 85, 57] })).rejects.toBe(network)
  const url = new URL(String(request.mock.calls[0]?.[0]), 'http://localhost')
  expect(url.pathname).toBe('/api/v1/pois')
  expect([...url.searchParams]).toEqual([['scope', 'trip'], ['trip_id', uuid], ['bbox', '84,56,85,57']])
})
