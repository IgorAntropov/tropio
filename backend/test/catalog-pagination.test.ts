import { randomUUID } from 'node:crypto';
import {
  expect,
  it,
  vi,
} from 'vitest';
import { createApplication } from '../src/create-application.js';
import { GeoPublicationService } from '../src/geo/publication/geo-publication.service.js';
import { IdentityService } from '../src/identity/identity.service.js';
import { CatalogService } from '../src/publication/catalog.service.js';
import { catalogInput } from '../src/publication/publication-input.js';
import { PublicCatalog } from '../src/travel/public-catalog.js';
import type { Candidate } from '../src/travel/public-catalog.js';

it.each([
  { secondVisible: false, more: true },
  { secondVisible: true, more: false },
  { secondVisible: true, more: true },
])('deduplicates a republished trip before filling the page and checking lookahead ($secondVisible, $more)', async ({ secondVisible, more }) => {
  const app = await createApplication({ logger: false }, {}, { publicationWorker: false });
  const ownerId = randomUUID();
  const organizer = { id: ownerId, display_name: 'Анна', avatar: null };
  const candidate = (distance_m: number): Candidate & { distance_m: number } => ({
    tripId: randomUUID(),
    ownerId,
    distance_m,
    publication_id: randomUUID(),
    access_generation: '1',
    applications_open: true,
    confirmed_participants: 0,
    operationId: randomUUID(),
    poiIds: [],
    routes: [],
    snapshot: {
      title: 'Поездка',
      description: null,
      start_date: null,
      end_date: null,
      difficulty: null,
      free_capacity: null,
      trip_type: 'foot',
      lifecycle: 'planned',
      days: [{ position: 1, local_date: null, description: null }],
    },
  });
  const first = candidate(1);
  const second = candidate(2);
  const hidden = Array.from({ length: 14 }, (_, i) => candidate(i + 3));
  const republished = {
    ...first,
    publication_id: randomUUID(),
    distance_m: 17,
    access_generation: '2',
  };
  const next = candidate(18);
  const point = { lon: 85, lat: 56 };
  const travel = app.get(PublicCatalog);
  const geo = app.get(GeoPublicationService);
  const identity = app.get(IdentityService);
  const input = catalogInput({ limit: '2', near: '85,56' });
  try {
    vi.spyOn(travel, 'candidates').mockResolvedValueOnce([first, second, ...hidden])
      .mockResolvedValueOnce(more ? [republished, next] : [republished]);
    vi.spyOn(geo, 'readStarts').mockResolvedValueOnce([point, secondVisible ? point : null, ...hidden.map(() => null)])
      .mockResolvedValueOnce(more ? [point, point] : [point]);
    const profiles = vi.spyOn(identity, 'publicOrganizers').mockResolvedValue(new Map([[ownerId, organizer]]));
    const confirm = vi.spyOn(travel, 'confirm').mockImplementation(async candidates => new Map(
      candidates.map(row => [row.tripId, { ...row, id: row.tripId }]),
    ));
    const result = await app.get(CatalogService).list(input);
    const last = secondVisible ? second : next;
    expect(result.items.map(({ trip_id, publication_id }) => [trip_id, publication_id]))
      .toEqual([[first.tripId, first.publication_id], [last.tripId, last.publication_id]]);
    expect(result.items.map(item => item.organizer)).toEqual([organizer, organizer]);
    expect(profiles.mock.calls).toEqual([[[ownerId]], [[ownerId]]]);
    expect(profiles.mock.invocationCallOrder[1]!).toBeLessThan(confirm.mock.invocationCallOrder[1]!);
    expect(result.next_cursor).toBe(secondVisible && more ? input.encode({ id: second.tripId, distance: 2 }) : null);
  }
  finally {
    await app.close();
  }
});
