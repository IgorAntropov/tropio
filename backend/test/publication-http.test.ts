import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { GeoPublicationService } from '../src/geo/publication/geo-publication.service.js';
import { TripApplications } from '../src/travel/trip-applications.js';
import {
  actor,
  approve,
  createPoi,
  declaredErrors,
  draftBody,
  identityPool,
  json,
  moderator,
  owner,
  positions,
  problem,
  routePath,
  seen,
  send,
  server,
  start,
  trip,
  visitor,
} from './geo-http-fixture.js';
import type {
  Method,
  Route,
  Trip,
} from './geo-http-fixture.js';

type Draft = Trip & { publication_id: string | null };
type Operation = { status: 'pending' | 'succeeded' | 'failed'; operation_id: string; code?: string; publication_id?: string };
type Card = {
  trip_id: string; publication_id: string; title: string; trip_type: string;
  days: { lines: { coordinates: number[][] }[] }[];
  pois: { poi_id: string }[];
};
type Page = { items: { trip_id: string; title: string; distance_m?: number; start: { lon: number; lat: number } }[]; next_cursor: string | null };
const contractTrip = '/trips/{tripId}';
const publicPath = '/catalog/trips';
const optionsPath = '/catalog/filter-options';
const applicationPath = contractTrip + '/applications';
const participationPath = '/catalog/participation';
const pollPath = contractTrip + '/publication-operations/{operationId}';

function manifest(draft: Trip, route: Route, poiIds: string[] = []) {
  const day = draft.days[0]!;
  return {
    trip_revision_id: draft.trip_revision_id,
    poi_ids: poiIds,
    routes: [{ day_id: day.day_id, route_id: day.route_id, route_revision_id: route.route_revision_id }],
  };
}

async function prepareTrip(linkedPoi?: string, near = positions[0] as { lon: number; lat: number }, title?: string, difficulty = 'Легко') {
  const created = await trip(owner);
  if (linkedPoi) {
    expect((await send('PUT', `/trips/${created.trip_id}/pois/${linkedPoi}`, owner)).status).toBe(204);
  }
  const draft = await json<Draft>(await send('PATCH', `/trips/${created.trip_id}`, owner, {
    trip_revision_id: created.trip_revision_id,
    visibility: 'public',
    title: title ?? `Томь ${created.trip_id}`,
    start_date: '2026-12-01',
    end_date: '2026-12-05',
    difficulty,
    free_capacity: 4,
  }), 200);
  const body = draftBody([near, positions[2]], ['foot']);
  const route = await json<Route>(await send('PUT', routePath(draft), owner, {
    ...body,
    points: [{ position: near, ...(linkedPoi ? { poi_id: linkedPoi } : {}) }, body.points[1]],
  }), 200);
  return {
    draft,
    route,
    path: `/trips/${draft.trip_id}`,
    card: `${publicPath}/${draft.trip_id}`,
  };
}

async function waitForOperation(path: string, id: string) {
  let terminal: Operation | undefined;
  await expect.poll(async () => {
    terminal = await json<Operation>(await send('GET', `${path}/publication-operations/${id}`, owner), 200);
    return terminal.status;
  }, { timeout: 10_000, interval: 40 }).not.toBe('pending');
  return terminal!;
}

async function publish(path: string, body: ReturnType<typeof manifest>, key = randomUUID()) {
  const response = await send('POST', `${path}/publish`, owner, body, { key });
  const pending = await json<Operation>(response, 202);
  expect(response.headers.get('location')).toBe(`/api/v1${path}/publication-operations/${pending.operation_id}`);
  const terminal = await waitForOperation(path, pending.operation_id);
  expect(terminal).toMatchObject({ status: 'succeeded', publication_id: expect.any(String) });
  return terminal;
}

describe('GIS-06 through the BFF', () => {
  it('AT-17 serves a single pinned snapshot until explicit republication, even after a retry', async () => {
    const { draft, route, path, card } = await prepareTrip();
    expect((await send('GET', card)).status).toBe(404);
    const key = randomUUID();
    const body = manifest(draft, route);
    const first = await publish(path, body, key);
    const replay = await json<Operation>(await send('POST', `${path}/publish`, owner, body, { key }), 200);
    expect(replay).toEqual(first);
    const initial = await json<Card>(await send('GET', card), 200);
    expect(initial).toMatchObject({ start: positions[0], days: [{ legs: [{ transport_mode: 'foot', distance_m: expect.any(Number) }] }] });
    expect(initial).toMatchObject({
      publication_id: first.publication_id,
      organizer: { id: owner.id, display_name: expect.any(String) },
      free_capacity: 4,
      trip_type: 'foot',
      day_count: 1,
    });
    const current = await json<Draft>(await send('GET', `${path}/draft`, owner), 200);
    expect(current).toMatchObject({ published_manifest: { trip_revision_id: current.trip_revision_id, routes: body.routes, poi_count: 0 } });
    const nextTitle = `Новая поездка ${draft.trip_id}`;
    const changed = await json<Draft>(await send('PATCH', path, owner, {
      trip_revision_id: current.trip_revision_id,
      title: nextTitle,
    }), 200);
    expect(changed).toMatchObject({ published_manifest: { trip_revision_id: current.trip_revision_id } });
    const replacement = draftBody([positions[0], positions[3]], ['foot'], route.route_revision_id);
    const latest = await json<Route>(await send('PUT', routePath(draft), owner, {
      ...replacement,
      points: replacement.points.map((point, index) => ({ ...point, name: index ? 'Вид на реку' : 'Пристань' })),
      tracks: replacement.tracks.map(track => ({ ...track, name: 'Набережная' })),
    }), 200);
    expect(await json<Card>(await send('GET', card), 200)).toEqual(initial);
    const second = await publish(path, manifest(changed, latest));
    const updated = await json<Card>(await send('GET', card), 200);
    expect(updated).toMatchObject({ days: [{ legs: [{ name: 'Набережная', start_name: 'Пристань', end_name: 'Вид на реку' }] }] });
    expect(updated).toMatchObject({ title: nextTitle, publication_id: second.publication_id });
    expect(updated.days[0]!.lines[0]!.coordinates.at(-1)).toEqual([positions[3].lon, positions[3].lat]);
    const filters = new URLSearchParams({
      q: nextTitle.toUpperCase(),
      trip_type: 'car,foot',
      start_date: '2026-12-05',
      end_date: '2026-12-06',
      difficulty: 'Легко',
      bbox: '84,56,85,57',
    });
    const page = await json<Page>(await send('GET', `${publicPath}?${filters}`), 200);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ trip_id: draft.trip_id, publication_id: second.publication_id, start: positions[0] });
    filters.set('near', '84.94,56.48');
    filters.set('radius_km', '0.1');
    expect((await json<Page>(await send('GET', `${publicPath}?${filters}`), 200)).items[0]).toMatchObject({ distance_m: 0 });
    filters.set('near', '85.94,57.48');
    expect((await json<Page>(await send('GET', `${publicPath}?${filters}`), 200)).items).toHaveLength(0);
    filters.delete('near');
    filters.delete('radius_km');
    filters.set('trip_type', 'car');
    expect((await json<Page>(await send('GET', `${publicPath}?${filters}`), 200)).items).toHaveLength(0);
  }, 30_000);

  it('loads system dictionaries and filters published starts within regional borders and legacy difficulty labels', async () => {
    type Option = { value: string; label: string };
    const options = await json<{ regions: Option[]; difficulties: Option[] }>(await send('GET', optionsPath), 200);
    expect(options.regions).toContainEqual({ value: 'RU-TOM', label: 'Томская область' });
    expect(options.difficulties.map(level => level.value)).toEqual(['easy', 'moderate', 'hard', 'other']);
    const query = randomUUID();
    const kolpashevo = await prepareTrip(undefined, { lon: 82.9, lat: 58.31 }, query + ' Колпашево', 'ЛЁГКАЯ');
    const novosibirsk = await prepareTrip(undefined, { lon: 82.92, lat: 55.03 }, query + ' Новосибирск', 'Для опытных туристов');
    await publish(kolpashevo.path, manifest(kolpashevo.draft, kolpashevo.route));
    await publish(novosibirsk.path, manifest(novosibirsk.draft, novosibirsk.route));
    const items = async (filters: Record<string, string>) => {
      const page = await json<Page>(await send('GET', publicPath + '?' + new URLSearchParams({ q: query, ...filters })), 200);
      return page.items.map(item => item.trip_id);
    };
    expect(await items({ region: 'RU-TOM', difficulty: 'easy' })).toEqual([kolpashevo.draft.trip_id]);
    expect(await items({ region: 'RU-NVS', difficulty: 'other' })).toEqual([novosibirsk.draft.trip_id]);
    expect(await items({ difficulty: 'Для опытных туристов' })).toEqual([novosibirsk.draft.trip_id]);
    expect(await items({ region: 'ZZ-ZZZ' })).toEqual([]);
    await problem(await send('GET', publicPath + '?region=Tomsk'), 'GET', publicPath, 400, 'INVALID_REQUEST');
  }, 30_000);

  it('paginates by distance from the first day and binds cursors to the original location', async () => {
    const search = randomUUID();
    const first = await prepareTrip(undefined, positions[0], search + ' А');
    const last = await prepareTrip(undefined, positions[3], search + ' Б');
    await publish(first.path, manifest(first.draft, first.route));
    await publish(last.path, manifest(last.draft, last.route));
    const filter = new URLSearchParams({
      q: search,
      near: '84.94,56.48',
      radius_km: '10',
      limit: '1',
    });
    const one = await json<Page>(await send('GET', publicPath + '?' + filter), 200);
    expect(one.items).toHaveLength(1);
    expect(one.items[0]).toMatchObject({ distance_m: 0, trip_id: first.draft.trip_id });
    expect(one.next_cursor).toBeTruthy();
    filter.set('cursor', one.next_cursor!);
    const two = await json<Page>(await send('GET', publicPath + '?' + filter), 200);
    expect(two.items.map(x => x.trip_id)).toEqual([last.draft.trip_id]);
    expect(two.items[0]!.distance_m).toBeGreaterThan(0);
    expect(two.next_cursor).toBeNull();
    filter.set('near', '85.94,57.48');
    await problem(await send('GET', publicPath + '?' + filter), 'GET', publicPath, 400, 'INVALID_REQUEST');
  }, 15_000);

  it('AT-18 filters optional POIs live and hides the entire snapshot when a route reveals a revoked position', async () => {
    const linked = await createPoi(owner, 'global');
    const optional = await createPoi(visitor, 'global');
    const linkedVersion = await approve(linked);
    const optionalVersion = await approve(optional);
    const { draft, route, path, card } = await prepareTrip(linked.poi_id);
    expect((await send('PUT', `${path}/pois/${optional.poi_id}`, owner)).status).toBe(204);
    const future = await json<Draft>(await send('PATCH', path, owner, {
      trip_revision_id: draft.trip_revision_id,
      start_date: '2200-01-01',
      end_date: '2200-01-01',
    }), 200);
    await publish(path, manifest(future, route, [optional.poi_id]));
    expect(await json(await send('POST', path + '/applications', visitor), 200)).toEqual({ status: 'pending' });
    expect((await json<Card>(await send('GET', card), 200)).pois.map(poi => poi.poi_id)).toEqual([optional.poi_id]);
    await json(await send('PATCH', `/pois/${optional.poi_id}/visibility`, visitor, {
      poi_revision_id: optionalVersion.poi_revision_id,
      visibility: 'private',
    }), 200);
    expect((await json<Card>(await send('GET', card), 200)).pois).toEqual([]);
    const ownDraft = await json<Draft>(await send('GET', path + '/draft', owner), 200);
    expect(ownDraft).toMatchObject({ published_manifest: { poi_count: 1 } });
    expect(JSON.stringify(ownDraft)).not.toContain(optional.poi_id);
    await json(await send('PATCH', `/pois/${linked.poi_id}/visibility`, owner, {
      poi_revision_id: linkedVersion.poi_revision_id,
      visibility: 'private',
    }), 200);
    await problem(await send('GET', card, visitor), 'GET', publicPath + '/{tripId}', 404, 'NOT_FOUND');
    await problem(await send('POST', path + '/applications', visitor), 'POST', applicationPath, 404, 'NOT_FOUND');
    expect(await json(await send('GET', participationPath + '?trip_ids=' + draft.trip_id, visitor), 200)).toEqual({ viewer_id: visitor.id, trip_ids: [], joined_trip_ids: [] });
    expect((await json<Page>(await send('GET', `${publicPath}?q=${draft.trip_id}`), 200)).items).toHaveLength(0);
  }, 30_000);

  it('withdraws the active snapshot on closing, republishing requires a new explicit command', async () => {
    const { path, card, draft, route } = await prepareTrip();
    await publish(path, manifest(draft, route));
    const active = await json<Draft>(await send('GET', `${path}/draft`, owner), 200);
    const closed = await json<Draft>(await send('PATCH', path, owner, {
      visibility: 'private',
      trip_revision_id: active.trip_revision_id,
    }), 200);
    expect(closed.publication_id).toBeNull();
    expect((await send('GET', card)).status).toBe(404);
    await json(await send('PATCH', path, owner, { visibility: 'public', trip_revision_id: closed.trip_revision_id }), 200);
    expect((await send('GET', card)).status).toBe(404);
  }, 15_000);

  it('returns guest participation for absent and expired sessions without personalizing public resources', async () => {
    const { draft, route, path, card } = await prepareTrip();
    await publish(path, manifest(draft, route));
    const participation = participationPath + '?trip_ids=' + draft.trip_id;
    const expired = await actor();
    await identityPool.query(
      `UPDATE identity.sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE user_id = $1`, [expired.id],
    );
    for (const [session, viewer] of [[undefined, null], [expired, null], [visitor, visitor.id]] as const) {
      const response = await send('GET', participation, session);
      expect(response.headers.get('vary')).toBe('Cookie');
      expect(await json(response, 200)).toEqual({ viewer_id: viewer, trip_ids: [], joined_trip_ids: [] });
    }
    const invalid = await send('GET', participationPath + '?trip_ids=bad');
    expect(invalid.headers.get('vary')).toBe('Cookie');
    await problem(invalid, 'GET', participationPath, 400, 'INVALID_REQUEST');
    for (const resource of [publicPath + '?q=' + draft.trip_id, card, optionsPath]) {
      const guest = await json(await send('GET', resource), 200);
      expect(await json(await send('GET', resource, visitor), 200)).toEqual(guest);
      expect(JSON.stringify(guest)).not.toContain('viewer_id');
    }
  }, 15_000);

  it('accepts concurrent applications once, keeps capacity and validates the current session, published route and enrollment', async () => {
    const { draft, route, path, card } = await prepareTrip();
    const id = draft.trip_id;
    const target = path + '/applications';
    const mine = participationPath + '?trip_ids=' + id;
    const edit = async (patch: Record<string, unknown>) => {
      const current = await json<Draft>(await send('GET', path + '/draft', owner), 200);
      return json<Draft>(await send('PATCH', path, owner, { trip_revision_id: current.trip_revision_id, ...patch }), 200);
    };
    const open = await edit({
      start_date: '2200-01-01',
      end_date: '2200-01-01',
      free_capacity: 1,
      timezone: 'Asia/Tomsk',
    });
    await publish(path, manifest(open, route));
    expect(await json(await send('GET', card), 200)).toMatchObject({ applications_open: true, free_capacity: 1 });
    await problem(await send('POST', target), 'POST', applicationPath, 401, 'SESSION_REQUIRED');
    await problem(await send('POST', target, visitor, {}, { csrf: 'invalid' }), 'POST', applicationPath, 403, 'CSRF_REJECTED');
    await problem(await send('POST', target, visitor, { applicant_user_id: owner.id }), 'POST', applicationPath, 400, 'INVALID_REQUEST');
    await problem(await send('POST', target, owner), 'POST', applicationPath, 409, 'TRIP_APPLICATION_UNAVAILABLE');
    await problem(await send('GET', mine + ',' + id, visitor), 'GET', participationPath, 400, 'INVALID_REQUEST');
    expect(await json(await send('GET', mine, visitor), 200)).toEqual({ viewer_id: visitor.id, trip_ids: [], joined_trip_ids: [] });
    const replies = await Promise.all([send('POST', target, visitor, undefined, { key: false }), send('POST', target, visitor, {})]);
    for (const reply of replies) {
      expect(await json(reply, 200)).toEqual({ status: 'pending' });
    }
    expect(await json(await send('GET', mine, visitor), 200)).toEqual({ viewer_id: visitor.id, trip_ids: [id], joined_trip_ids: [] });
    expect(await json(await send('GET', mine, moderator), 200)).toEqual({ viewer_id: moderator.id, trip_ids: [], joined_trip_ids: [] });
    expect(await json(await send('GET', card), 200)).toMatchObject({ applications_open: true, free_capacity: 1 });
    const pool = new pg.Pool({ connectionString: process.env.TROPIO_TRAVEL_TEST_DATABASE_URL! });
    try {
      const rows = await pool.query(
        `SELECT a.id, e.id AS event_id FROM travel.trip_applications a
         LEFT JOIN travel.trip_audit_events e ON e.object_id = a.id AND e.action = 'trip.application.submit'
         WHERE a.trip_id = $1 AND a.applicant_user_id = $2`, [id, visitor.id],
      );
      expect(rows.rows).toEqual([{ id: expect.any(String), event_id: expect.any(String) }]);
    }
    finally {
      await pool.end();
    }
    const closed = await edit({ start_date: '2000-01-01', end_date: '2000-01-01' });
    await publish(path, manifest(closed, route));
    expect(await json(await send('GET', card), 200)).toMatchObject({ applications_open: false });
    expect(await json(await send('POST', target, visitor), 200)).toEqual({ status: 'pending' });
    await problem(await send('POST', target, moderator), 'POST', applicationPath, 409, 'TRIP_APPLICATION_UNAVAILABLE');
    const unlimited = await edit({ start_date: null, end_date: null, free_capacity: null });
    await publish(path, manifest(unlimited, route));
    expect(await json(await send('GET', card), 200)).toMatchObject({ applications_open: true, free_capacity: null });
    const applications = server.app.get(TripApplications);
    const original = applications.submit.bind(applications);
    const archive = vi.spyOn(applications, 'submit').mockImplementationOnce(async (...args) => {
      const current = await json<Draft>(await send('GET', path + '/draft', owner), 200);
      await json(await send('POST', path + '/archive', owner, { trip_revision_id: current.trip_revision_id }), 200);
      return original(...args);
    });
    try {
      await problem(await send('POST', target, moderator), 'POST', applicationPath, 404, 'NOT_FOUND');
      expect(await json(await send('GET', mine, visitor), 200)).toEqual({ viewer_id: visitor.id, trip_ids: [], joined_trip_ids: [] });
    }
    finally {
      archive.mockRestore();
    }
  }, 30_000);

  it('pins admission to the published version, serializes the last seat and upgrades a pending applicant only with explicit consent', async () => {
    const { draft, route, path, card } = await prepareTrip();
    const id = draft.trip_id;
    const join = path + '/applications';
    const myParticipation = participationPath + '?trip_ids=' + id;
    const edit = async (patch: Record<string, unknown>) => {
      const current = await json<Draft>(await send('GET', path + '/draft', owner), 200);
      return json<Draft>(await send('PATCH', path, owner, { trip_revision_id: current.trip_revision_id, ...patch }), 200);
    };
    const request = await edit({ free_capacity: 1, start_date: '2200-01-01', end_date: null });
    expect(request).toMatchObject({ admission_mode: 'request' });
    await publish(path, manifest(request, route));
    expect(await json(await send('POST', join, visitor, { admission_mode: 'request' }), 200)).toEqual({ status: 'pending' });
    const open = await edit({ admission_mode: 'open' });
    expect(open).toMatchObject({ admission_mode: 'open' });
    expect(await json(await send('GET', card), 200)).toMatchObject({ admission_mode: 'request', confirmed_participants: 0 });
    await problem(await send('POST', join, moderator, { admission_mode: 'open' }), 'POST', applicationPath, 409, 'TRIP_APPLICATION_UNAVAILABLE');
    await publish(path, manifest(open, route));
    expect(await json(await send('GET', card), 200)).toMatchObject({ admission_mode: 'open', applications_open: true });
    await problem(await send('POST', join, moderator, {}), 'POST', applicationPath, 409, 'TRIP_APPLICATION_UNAVAILABLE');
    await problem(await send('POST', join, moderator, { admission_mode: 'unknown' }), 'POST', applicationPath, 400, 'INVALID_REQUEST');
    expect(await json(await send('POST', join, visitor), 200)).toEqual({ status: 'pending' });
    const applicants = [visitor, moderator];
    const replies = await Promise.all(applicants.map(user => send('POST', join, user, { admission_mode: 'open' })));
    expect(replies.map(reply => reply.status).sort()).toEqual([200, 409]);
    const winner = applicants[replies.findIndex(reply => reply.status === 200)]!;
    for (const reply of replies) {
      if (reply.status === 200) {
        expect(await json(reply, 200)).toEqual({ status: 'joined' });
      }
      else {
        await problem(reply, 'POST', applicationPath, 409, 'TRIP_APPLICATION_UNAVAILABLE');
      }
    }
    expect(await json(await send('POST', join, winner, { admission_mode: 'open' }), 200)).toEqual({ status: 'joined' });
    expect(await json(await send('GET', myParticipation, winner), 200)).toEqual({ viewer_id: winner.id, trip_ids: [], joined_trip_ids: [id] });
    expect(await json(await send('GET', card), 200)).toMatchObject({ applications_open: false, confirmed_participants: 1, free_capacity: 1 });
    const limitless = await edit({ free_capacity: null });
    await publish(path, manifest(limitless, route));
    for (const user of applicants) {
      expect(await json(await send('POST', join, user, { admission_mode: 'open' }), 200)).toEqual({ status: 'joined' });
      expect(await json(await send('GET', myParticipation, user), 200)).toEqual({ viewer_id: user.id, trip_ids: [], joined_trip_ids: [id] });
    }
    const undersized = await edit({ free_capacity: 1 });
    const attempt = await json<Operation>(await send('POST', path + '/publish', owner, manifest(undersized, route)), 202);
    expect(await waitForOperation(path, attempt.operation_id)).toMatchObject({ status: 'failed', code: 'PUBLICATION_PRECONDITION_FAILED' });
    expect(await json(await send('GET', card), 200)).toMatchObject({ free_capacity: null, confirmed_participants: 2, applications_open: true });
    const closed = await edit({ visibility: 'private' });
    expect(closed.publication_id).toBeNull();
    expect(await json(await send('GET', myParticipation, winner), 200)).toEqual({ viewer_id: winner.id, trip_ids: [], joined_trip_ids: [] });
    await problem(await send('POST', join, winner, { admission_mode: 'open' }), 'POST', applicationPath, 404, 'NOT_FOUND');
  }, 30_000);

  it('cancels a pending operation while Geo verifies it and rejects a late commit', async () => {
    const { draft, route, path, card } = await prepareTrip();
    const geo = server.app.get(GeoPublicationService);
    const original = geo.verify.bind(geo);
    let onEnter!: () => void;
    let resume!: () => void;
    const entered = new Promise<void>((resolve) => {
      onEnter = resolve;
    });
    const release = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const check = vi.spyOn(geo, 'verify').mockImplementationOnce(async (manifest) => {
      const result = await original(manifest);
      onEnter();
      await release;
      return result;
    });
    const pool = new pg.Pool({ connectionString: process.env.TROPIO_TRAVEL_TEST_DATABASE_URL! });
    try {
      const pending = await json<Operation>(await send('POST', path + '/publish', owner, manifest(draft, route)), 202);
      await entered;
      await json(await send('POST', path + '/unpublish', owner, {
        trip_revision_id: draft.trip_revision_id,
        publication_id: null,
      }), 200);
      resume();
      expect(await waitForOperation(path, pending.operation_id)).toMatchObject({ status: 'failed', code: 'PUBLICATION_CANCELLED' });
      await expect.poll(async () => (await pool.query(
        'SELECT release_acknowledged_at FROM travel.route_operations WHERE id = $1', [pending.operation_id],
      )).rows[0].release_acknowledged_at, { timeout: 5000 }).toBeTruthy();
      expect((await send('GET', card)).status).toBe(404);
      expect((await pool.query('SELECT 1 FROM travel.outbox_events WHERE aggregate_id = $1', [draft.trip_id])).rowCount).toBe(0);
    }
    finally {
      resume();
      check.mockRestore();
      await pool.end();
    }
  }, 15_000);

  it('commits just one of two publications from the same Travel revision', async () => {
    const { draft, route, path } = await prepareTrip();
    const body = manifest(draft, route);
    const results = await Promise.all([send('POST', path + '/publish', owner, body), send('POST', path + '/publish', owner, body)]);
    const terminal = await Promise.all(results.map(async (response) => {
      if (response.status === 409) {
        return ((await response.json()) as { code: string }).code;
      }
      const pending = await json<Operation>(response, 202);
      const operation = await waitForOperation(path, pending.operation_id);
      return operation.code ?? operation.status;
    }));
    expect(terminal.sort()).toEqual(['TRIP_REVISION_CONFLICT', 'succeeded']);
    const pool = new pg.Pool({ connectionString: process.env.TROPIO_TRAVEL_TEST_DATABASE_URL! });
    try {
      expect((await pool.query('SELECT 1 FROM travel.outbox_events WHERE aggregate_id = $1', [draft.trip_id])).rowCount).toBe(1);
    }
    finally {
      await pool.end();
    }
  }, 15_000);

  it('checks the HTTP status and problem code declared for each publication operation', async () => {
    const { draft, route, path, card } = await prepareTrip();
    const down = await start(process.env.TROPIO_GEO_TEST_DATABASE_URL!, process.env.TROPIO_IDENTITY_TEST_DATABASE_URL!,
      'postgresql://127.0.0.1:1/unavailable');
    const request = manifest(draft, route);
    await problem(await send('POST', path + '/applications', visitor, undefined, { server: down }),
      'POST', applicationPath, 503, 'DEPENDENCY_UNAVAILABLE');
    await problem(await send('GET', participationPath + '?trip_ids=' + draft.trip_id, visitor, undefined, { server: down }),
      'GET', participationPath, 503, 'DEPENDENCY_UNAVAILABLE');
    const terminal = await publish(path, request);
    const active = await json<Draft>(await send('GET', `${path}/draft`, owner), 200);
    const remove = { trip_revision_id: active.trip_revision_id, publication_id: active.publication_id };
    const ops: { method: Method; target: string; spec: string; body?: object; bad: string; guest?: boolean }[] = [
      {
        method: 'GET',
        target: optionsPath,
        spec: optionsPath,
        bad: optionsPath + '?q=1',
        guest: true,
      },
      {
        method: 'GET',
        target: publicPath,
        spec: publicPath,
        bad: publicPath + '?limit=0',
        guest: true,
      },
      {
        method: 'GET',
        target: card,
        spec: publicPath + '/{tripId}',
        bad: publicPath + '/bad',
        guest: true,
      },
      {
        method: 'GET',
        target: `${path}/publication-operations/${terminal.operation_id}`,
        spec: pollPath,
        bad: `${path}/publication-operations/bad`,
      },
      ...['publish', 'unpublish', 'archive'].map(action => ({
        method: 'POST' as const,
        target: `${path}/${action}`,
        spec: `${contractTrip}/${action}`,
        body: action === 'publish' ? request : action === 'unpublish' ? remove : { trip_revision_id: active.trip_revision_id },
        bad: `/trips/bad/${action}`,
      })),
    ];
    for (const { method, target, spec, body, bad, guest } of ops) {
      const actor = guest ? undefined : owner;
      await problem(await send(method, bad, actor, body), method, spec, 400, 'INVALID_REQUEST');
      await problem(await send(method, target, actor, body, { server: down }), method, spec, 503, 'DEPENDENCY_UNAVAILABLE');
      if (!guest) {
        await problem(await send(method, target, undefined, body), method, spec, 401, 'SESSION_REQUIRED');
        await problem(await send(method, target, visitor, body), method, spec, 404, 'NOT_FOUND');
      }
      if (method === 'POST') {
        await problem(await send(method, target, owner, body, { csrf: 'foreign' }), method, spec, 403, 'CSRF_REJECTED');
        await problem(await send(method, target, owner, { ...body, trip_revision_id: randomUUID() }), method, spec, 409, 'TRIP_REVISION_CONFLICT');
      }
    }
    const fresh = manifest(active, route);
    const key = randomUUID();
    const mismatch = { ...fresh, routes: [{ ...fresh.routes[0], day_id: randomUUID() }] };
    await problem(await send('POST', path + '/publish', owner, mismatch), 'POST', contractTrip + '/publish', 422, 'INVALID_PUBLICATION_MANIFEST');
    await publish(path, fresh, key);
    await problem(await send('POST', path + '/publish', owner, mismatch, { key }), 'POST', contractTrip + '/publish', 409, 'IDEMPOTENCY_KEY_REUSED');
    let current = await json<Draft>(await send('GET', path + '/draft', owner), 200);
    for (const action of ['unpublish', 'archive']) {
      const command = action === 'unpublish'
        ? { publication_id: current.publication_id, trip_revision_id: current.trip_revision_id }
        : { trip_revision_id: current.trip_revision_id };
      const idem = randomUUID();
      const response = await json<Draft>(await send('POST', path + '/' + action, owner, command, { key: idem }), 200);
      expect(response.publication_id).toBeNull();
      expect((await send('GET', card)).status).toBe(404);
      await problem(await send('POST', path + '/' + action, owner, { ...command, trip_revision_id: randomUUID() }, { key: idem }),
        'POST', contractTrip + '/' + action, 409, 'IDEMPOTENCY_KEY_REUSED');
      current = response;
    }
    expect([...seen].sort()).toEqual([...declaredErrors('Travel publications'), ...declaredErrors('Travel participation')].sort());
  }, 30_000);
});
