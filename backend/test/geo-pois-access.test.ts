import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  canReadPoi,
  fitsTripScope,
} from '../src/geo/pois/poi-access.js';
import type { PoiRow } from '../src/geo/pois/poi-data.js';

const authorId = 'c11f4ebf-09b3-40e0-8ee3-139107feecb5';
const otherId = '6ad3f12a-d53d-4e26-8f47-80fd5cc0ef7f';
const tripId = '79c8c232-3a3a-49eb-8437-0dacdf69ee93';
const locationId = 'ff37a311-d611-45f3-8ea8-ab504df93c12';
const poi: PoiRow = {
  poi_id: '83b4ed3a-1baa-417f-b321-2856abfbd188',
  author_user_id: authorId,
  poi_revision_id: '12ed1ca2-a979-4302-ba71-5e416fb11870',
  version: '1',
  position_revision_id: locationId,
  approved_position_revision_id: locationId,
  category_id: '15ca0f49-7f61-4352-9d66-29cb50add7a4',
  name: 'Смотровая площадка',
  description: null,
  source: 'manual',
  position: { lon: 84, lat: 56 },
  visibility: 'global',
  scope_trip_id: null,
  moderation_status: 'approved',
  primary_media_id: null,
  deleted: false,
  media: [],
};

describe('Current POI policy', () => {
  it('requires approval of the exact position for public visibility and hides tombstones', async () => {
    const checkTrip = vi.fn(async () => true);
    const moved = { ...poi, position_revision_id: '4463e954-5722-4701-978e-befcfa99e0fe' };
    expect(await canReadPoi(poi, null, checkTrip)).toBe(true);
    expect(await canReadPoi(moved, null, checkTrip)).toBe(false);
    expect(await canReadPoi(moved, otherId, checkTrip)).toBe(false);
    expect(await canReadPoi(moved, authorId, checkTrip)).toBe(true);
    expect(await canReadPoi({ ...poi, deleted: true }, authorId, checkTrip)).toBe(false);
    expect(checkTrip).not.toHaveBeenCalled();
  });

  it('checks current source-trip access for everyone and never consults it for guests', async () => {
    const tripPoi: PoiRow = { ...poi, visibility: 'trip', scope_trip_id: tripId };
    const checkTrip = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await canReadPoi(tripPoi, null, checkTrip)).toBe(false);
    expect(checkTrip).not.toHaveBeenCalled();
    expect(await canReadPoi(tripPoi, authorId, checkTrip)).toBe(false);
    expect(await canReadPoi(tripPoi, otherId, checkTrip)).toBe(true);
    expect(checkTrip.mock.calls).toEqual([[authorId, tripId], [otherId, tripId]]);
    expect(fitsTripScope(tripPoi, tripId)).toBe(true);
    expect(fitsTripScope(tripPoi, 'ed393842-c1a5-411c-940d-55c5165e731d')).toBe(false);
  });

  it('keeps private POIs accessible only to the author', async () => {
    const privatePoi: PoiRow = { ...poi, visibility: 'private' };
    const checkTrip = vi.fn(async () => true);
    expect(await canReadPoi(privatePoi, authorId, checkTrip)).toBe(true);
    expect(await canReadPoi(privatePoi, otherId, checkTrip)).toBe(false);
    expect(await canReadPoi(privatePoi, null, checkTrip)).toBe(false);
    expect(checkTrip).not.toHaveBeenCalled();
  });
});
