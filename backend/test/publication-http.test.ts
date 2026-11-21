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
import { IdentityService } from '../src/identity/identity.service.js';
import {
  ProfileSocial,
  SocialDatabase,
} from '../src/social/profile-social.js';
import { ProfileTrips } from '../src/travel/profile-trips.js';
import { recordLifecycle } from '../src/travel/trip-lifecycle.js';
import { TravelDatabase } from '../src/travel/travel-database.js';
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

import { tripCover } from './trip-cover-fixture.js';

type Draft = Trip & { cover_id: string | null; publication_id: string | null };
type Operation = { status: 'pending' | 'succeeded' | 'failed'; operation_id: string; code?: string; publication_id?: string };
type Card = {
  trip_id: string; publication_id: string; title: string; trip_type: string;
  days: { lines: { coordinates: number[][] }[] }[];
  pois: { poi_id: string }[];
};
type Page = { items: { trip_id: string; title: string; distance_m?: number; start: { lon: number; lat: number } }[]; next_cursor: string | null };
const contractTrip = '/trips/{tripId}';
const publicPath = '/catalog/trips';
const publicCoverPath = publicPath + '/{tripId}/covers/{coverId}';
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

async function prepareTrip(linkedPoi?: string, near = positions[0] as { lon: number; lat: number }, title?: string, difficulty = 'Легко', mode: 'foot' | 'bicycle' = 'foot') {
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
  const body = draftBody([near, positions[2]], [mode]);
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
  it('counts visible personal trips separately from confirmed finishes, retained grades and organizer reviews', async () => {
    const path = '/me/overview';
    type Overview = {
      viewer_id: string;
      trips: { created: number; planned: number; in_progress: number; completed: number; archived: number };
      rating: { average: number | null; count: number };
      level: { code: string; completed: number; next_at: number | null };
      achievements: { group: string; progress: number; earned: { code: string; threshold: number }[] }[];
    };
    const overview = async (viewer: typeof owner) => json<Overview>(await send('GET', path, viewer), 200);
    const publicOverview = async (id: string) => json<Omit<Overview, 'viewer_id'>>(await send('GET', '/users/' + id + '/overview'), 200);
    const blank = await actor();
    const empty = await overview(blank);
    expect(empty).toMatchObject({
      viewer_id: blank.id,
      trips: {
        created: 0,
        planned: 0,
        in_progress: 0,
        completed: 0,
        archived: 0,
      },
      rating: { average: null, count: 0 },
      level: { code: 'novice', completed: 0, next_at: 3 },
    });
    expect(empty.achievements).toHaveLength(4);
    expect(empty.achievements.every(group => group.progress === 0 && !group.earned.length)).toBe(true);
    expect((await send('GET', path)).status).toBe(401);

    const guest = await actor();
    const place = await createPoi(owner, 'global');
    const placeRevision = await approve(place);
    const journey = await prepareTrip(place.poi_id);
    const { draft, route } = journey;
    const id = draft.trip_id;
    const profileTrips = server.app.get(ProfileTrips);
    const travelDb = server.app.get(TravelDatabase);
    const social = server.app.get(ProfileSocial);
    const editor = (userId: string) => ({ userId, confirmSession: async () => {} });
    const starting = await overview(owner);
    expect(starting.achievements.find(group => group.group === 'cartography')).toMatchObject({
      progress: 1,
      earned: [{ code: 'cartographer_1', threshold: 1 }],
    });
    const unpublished = await publicOverview(owner.id);
    expect(unpublished.trips.created).toBe(0);
    expect(unpublished.achievements.find(group => group.group === 'cartography')?.earned).toEqual([]);

    const future = await json<Draft>(await send('PATCH', journey.path, owner, {
      trip_revision_id: draft.trip_revision_id,
      start_date: '2200-02-01',
      end_date: '2200-02-02',
      admission_mode: 'request',
    }), 200);
    await publish(journey.path, manifest(future, route));
    await json(await send('PUT', '/me/favorites/' + id, guest, { saved: true }), 200);
    await json(await send('POST', journey.path + '/applications', guest), 200);
    expect((await overview(guest)).trips.planned).toBe(0);
    const initial = await json<Draft>(await send('GET', journey.path + '/draft', owner), 200);
    const open = await json<Draft>(await send('PATCH', journey.path, owner, { trip_revision_id: initial.trip_revision_id, admission_mode: 'open' }), 200);
    await publish(journey.path, manifest(open, route));
    for (const traveler of [blank, guest]) {
      await json(await send('POST', journey.path + '/applications', traveler, { admission_mode: 'open' }), 200);
      expect((await overview(traveler)).trips).toMatchObject({ created: 0, planned: 1, completed: 0 });
    }
    await expect(profileTrips.confirmCompletion(editor(blank.id), id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const current = await json<Draft>(await send('GET', journey.path + '/draft', owner), 200);
    await recordLifecycle(travelDb, editor(owner.id), id, randomUUID(), current.trip_revision_id, 'completed');
    const finished = await overview(blank);
    expect(finished.trips).toMatchObject({ planned: 0, completed: 1 });
    expect(finished.level.completed).toBe(0);

    const [one, replay] = await Promise.all([profileTrips.confirmCompletion(editor(blank.id), id), profileTrips.confirmCompletion(editor(blank.id), id)]);
    expect(replay).toEqual(one);
    await social.rateOrganizer(one, 4);
    await social.rateOrganizer(replay, 5);
    const two = await profileTrips.confirmCompletion(editor(guest.id), id);
    await social.rateOrganizer(two, 5);
    await expect(social.rateOrganizer({ ...two, participant_id: owner.id }, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const organizer = await overview(owner);
    expect(organizer.rating).toEqual({ average: 4.5, count: 2 });
    expect(organizer.achievements.find(group => group.group === 'organizing')).toMatchObject({ progress: 1, earned: [{ code: 'guide_1', threshold: 1 }] });
    expect(organizer.level.completed).toBe(0);
    const publicOwner = await publicOverview(owner.id);
    expect(publicOwner).not.toHaveProperty('viewer_id');
    expect(publicOwner).toMatchObject({
      trips: { created: 1, completed: 1, archived: 0 },
      rating: { average: 4.5, count: 2 },
      achievements: expect.arrayContaining([
        expect.objectContaining({ group: 'cartography', progress: 1 }),
        expect.objectContaining({ group: 'organizing', progress: 1 }),
      ]),
    });
    expect((await publicOverview(blank.id)).trips.completed).toBe(0);

    await json(await send('PATCH', '/pois/' + place.poi_id + '/visibility', owner, {
      poi_revision_id: placeRevision.poi_revision_id,
      visibility: 'private',
    }), 200);
    const personal = await overview(blank);
    expect(personal.trips.completed).toBe(0);
    expect(personal.level.completed).toBe(1);
    expect(personal.achievements.find(group => group.group === 'travel')).toMatchObject({ progress: 1, earned: [{ code: 'first_trip', threshold: 1 }] });
    const withdrawn = await publicOverview(owner.id);
    expect(withdrawn).toMatchObject({ trips: { created: 0, completed: 0 }, rating: { average: null, count: 0 } });
    expect(withdrawn.achievements.every(group => !group.earned.length && !group.progress)).toBe(true);

    const socialDb = server.app.get(SocialDatabase);
    await socialDb.transaction(async (client) => {
      const ids = Array.from({ length: 20 }, () => randomUUID());
      await client.query(`INSERT INTO social.friendships(first_user_id,second_user_id)
        SELECT least($1::uuid, friend), greatest($1::uuid, friend) FROM unnest($2::uuid[]) friend`, [guest.id, ids]);
      await client.query(`UPDATE social.friendships SET ended_at = clock_timestamp() WHERE (first_user_id,second_user_id)
        = (least($1::uuid,$2::uuid), greatest($1::uuid,$2::uuid))`, [guest.id, ids[0]]);
    });
    expect((await overview(guest)).achievements.find(group => group.group === 'friends')).toMatchObject({
      progress: 19,
      earned: [{ code: 'first_friend', threshold: 1 }, { code: 'sociable', threshold: 20 }],
    });
    expect((await publicOverview(guest.id)).achievements.some(group => group.group === 'friends')).toBe(false);
  }, 30_000);

  it('returns only visitor-visible sections and rejects unavailable profile identities', async () => {
    const traveler = await actor();
    const path = '/users/' + traveler.id + '/overview';
    expect((await send('GET', '/users/' + randomUUID() + '/overview')).status).toBe(404);
    expect((await send('GET', '/users/missing/overview')).status).toBe(400);
    await identityPool.query(
      `INSERT INTO identity.user_preferences (user_id, privacy_settings) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET privacy_settings = EXCLUDED.privacy_settings`,
      [traveler.id, JSON.stringify({ trips: 'friends', achievements: 'private' })],
    );
    const hidden = {
      trips: null,
      rating: { average: null, count: 0 },
      level: null,
      achievements: null,
    };
    expect(await json(await send('GET', path), 200)).toEqual(hidden);
    expect(await json(await send('GET', path, traveler), 200)).toEqual(hidden);
    await identityPool.query('UPDATE identity.users SET status = \'blocked\' WHERE id = $1', [traveler.id]);
    expect((await send('GET', path)).status).toBe(404);
    await identityPool.query('UPDATE identity.users SET status = \'active\', email_verified_at = NULL WHERE id = $1', [traveler.id]);
    expect((await send('GET', path)).status).toBe(404);
  });

  it('checks the visiting session, current friendship and section audiences before returning a profile', async () => {
    const traveler = await actor();
    const stranger = await actor();
    await trip(traveler);
    const bio = 'По выходным хожу в горы';
    await json(await send('PATCH', '/me', traveler, { bio }), 200);
    const path = '/me/visiting/' + traveler.id;
    const userPath = '/users/' + traveler.id;
    await identityPool.query(
      'INSERT INTO identity.user_preferences (user_id, privacy_settings) VALUES ($1, $2)',
      [traveler.id, JSON.stringify({ bio: 'friends', trips: 'friends', achievements: 'private' })],
    );
    expect((await send('GET', path)).status).toBe(401);
    expect((await send('GET', '/me/visiting/' + randomUUID(), stranger)).status).toBe(404);
    const view = async (viewer: typeof owner) => json(await send('GET', path, viewer), 200);
    expect(await view(traveler)).toMatchObject({
      viewer_id: traveler.id,
      profile: { bio },
      overview: { trips: { created: 1 }, level: { code: 'novice' }, achievements: expect.any(Array) },
    });
    const restricted = {
      viewer_id: stranger.id,
      profile: { bio: null },
      overview: { trips: null, achievements: null, level: null },
    };
    expect(await view(stranger)).toMatchObject(restricted);
    const social = server.app.get(SocialDatabase);
    const { rows: [friendship] } = await social.transaction(client => client.query<{ id: string }>(
      `INSERT INTO social.friendships (first_user_id, second_user_id)
       VALUES (least($1::uuid,$2::uuid), greatest($1::uuid,$2::uuid)) RETURNING id`, [traveler.id, stranger.id],
    ));
    expect(await json(await send('GET', userPath, stranger), 200)).toMatchObject({ bio: null });
    expect(await json(await send('GET', userPath + '/overview', stranger), 200)).toMatchObject({ trips: null, achievements: null });
    const response = await send('GET', path, stranger);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(await json(response, 200)).toMatchObject({
      viewer_id: stranger.id,
      profile: { bio },
      overview: { trips: { created: 0 }, level: null, achievements: null },
    });
    const identity = server.app.get(IdentityService);
    const load = identity.getVisitingProfile.bind(identity);
    const spy = vi.spyOn(identity, 'getVisitingProfile').mockImplementation(async (id, audience) => {
      const result = await load(id, audience);
      if (id === traveler.id && audience === 'friends') {
        await social.transaction(client => client.query('UPDATE social.friendships SET ended_at = now() WHERE id = $1', [friendship!.id]));
      }
      return result;
    });
    try {
      expect(await view(stranger)).toMatchObject(restricted);
    }
    finally {
      spy.mockRestore();
    }
    expect(await view(stranger)).toMatchObject(restricted);
    await identityPool.query('UPDATE identity.users SET status = \'blocked\' WHERE id = $1', [traveler.id]);
    expect((await send('GET', path, stranger)).status).toBe(404);
    await identityPool.query('UPDATE identity.users SET status = \'blocked\' WHERE id = $1', [stranger.id]);
    expect((await send('GET', path, stranger)).status).toBe(401);
  });

  it('AT-22 counts ten private journeys once across route revisions', async () => {
    const traveler = await actor();
    let lastRoute: Route | undefined;
    for (let i = 0; i < 10; i++) {
      const created = await trip(traveler);
      lastRoute = await json<Route>(await send('PUT', routePath(created), traveler, draftBody([positions[0], positions[1]], ['foot'])), 200);
    }
    await json(await send('PUT', '/routes/' + lastRoute!.route_id, traveler, draftBody([positions[0], positions[2]], ['foot'], lastRoute!.route_revision_id)), 200);
    await trip(traveler);
    const expected = {
      group: 'cartography',
      progress: 10,
      earned: [{ code: 'cartographer_1', threshold: 1 }, { code: 'cartographer_2', threshold: 10 }],
      next: { code: 'cartographer_3', threshold: 50 },
    };
    type Data = { achievements: typeof expected[] };
    const results = await Promise.all([1, 2].map(async () => json<Data>(await send('GET', '/me/overview', traveler), 200)));
    expect(results.map(data => data.achievements.find(group => group.group === 'cartography'))).toEqual([expected, expected]);
  }, 30_000);

  it('AT-24 preserves both independent finishes and one expert grade after simultaneous confirmations', async () => {
    const traveler = await actor();
    const db = server.app.get(TravelDatabase);
    const confirmations = server.app.get(ProfileTrips);
    const editor = { userId: traveler.id, confirmSession: async () => {} };
    const ids = Array.from({ length: 100 }, () => randomUUID());
    await db.transaction(async (client) => {
      await client.query(`INSERT INTO travel.trips (id, owner_user_id, created_by_user_id, title, lifecycle)
        SELECT id, $2, $2, 'Тестовое завершение', 'completed' FROM unnest($1::uuid[]) id`, [ids, traveler.id]);
      await client.query(`INSERT INTO travel.trip_participants(trip_id,user_id) SELECT id,$2 FROM unnest($1::uuid[]) id`, [ids.slice(0, 98), traveler.id]);
      await client.query(`INSERT INTO travel.trip_completions(trip_id,participant_id,participant_entry_id,organizer_id)
        SELECT trip_id,user_id,id,user_id FROM travel.trip_participants WHERE user_id = $1`, [traveler.id]);
    });
    const before = await json<{ level: { completed: number } }>(await send('GET', '/me/overview', traveler), 200);
    expect(before.level).toMatchObject({ code: 'pro', completed: 98, next_at: 100 });
    await Promise.all([ids[98]!, ids[99]!, ids[99]!].map(id => confirmations.confirmCompletion(editor, id)));
    const reads = await Promise.all([1, 2].map(async () => json<{ level: { code: string }; achievements: { group: string; earned: { code: string }[] }[] }>(
      await send('GET', '/me/overview', traveler), 200,
    )));
    for (const data of reads) {
      expect(data.level).toEqual({ code: 'expert', completed: 100, next_at: null });
      expect(data.achievements.find(group => group.group === 'travel')?.earned.filter(grade => grade.code === 'on_the_road_4')).toHaveLength(1);
    }
    const social = server.app.get(SocialDatabase);
    const awards = await social.transaction(client => client.query(
      'SELECT code FROM social.earned_grades WHERE user_id = $1 AND code = \'on_the_road_4\'', [traveler.id],
    ));
    expect(awards.rowCount).toBe(1);
  }, 30_000);

  it('AT-17 serves a single pinned snapshot until explicit republication, even after a retry', async () => {
    const { draft, path, card, route } = await prepareTrip(undefined, positions[0], undefined, 'Легко', 'bicycle');
    const firstDraft = await json<Page>(await send('GET', '/me/trips?query=' + draft.trip_id + '&status=draft', owner), 200);
    expect(firstDraft.items).toMatchObject([{ publication_id: null, trip_type: 'bicycle' }]);
    expect((await send('GET', card)).status).toBe(404);
    const key = randomUUID();
    const body = manifest(draft, route);
    const first = await publish(path, body, key);
    const replay = await json<Operation>(await send('POST', `${path}/publish`, owner, body, { key }), 200);
    expect(replay).toEqual(first);
    const initial = await json<Card>(await send('GET', card), 200);
    const publishedMetrics = { trip_type: 'bicycle', route_count: 1, total_distance_m: route.tracks[0]!.distance_m };
    expect(initial).toMatchObject(publishedMetrics);
    expect(initial).toMatchObject({ start: positions[0], days: [{ legs: [{ transport_mode: 'bicycle', distance_m: expect.any(Number) }] }] });
    expect(initial).toMatchObject({
      publication_id: first.publication_id,
      organizer: { id: owner.id, display_name: expect.any(String) },
      free_capacity: 4,
      trip_type: 'bicycle',
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
    const workingMetrics = { trip_type: 'foot', route_count: 1, total_distance_m: latest.tracks[0]!.distance_m };
    expect(workingMetrics.total_distance_m).not.toBe(publishedMetrics.total_distance_m);
    const ownCard = await json<Page>(await send('GET', '/me/trips?query=' + draft.trip_id, owner), 200);
    expect(ownCard.items).toMatchObject([workingMetrics]);
    const guestCards = await json<Page>(await send('GET', '/catalog/trips?q=' + draft.trip_id), 200);
    expect(guestCards.items).toMatchObject([publishedMetrics]);
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
    expect((await json<Page>(await send('GET', `${publicPath}?${filters}`), 200)).items[0]).toMatchObject({ distance_m: 0, ...workingMetrics });
    filters.set('near', '85.94,57.48');
    expect((await json<Page>(await send('GET', `${publicPath}?${filters}`), 200)).items).toHaveLength(0);
    filters.delete('near');
    filters.delete('radius_km');
    filters.set('trip_type', 'car');
    expect((await json<Page>(await send('GET', `${publicPath}?${filters}`), 200)).items).toHaveLength(0);
  }, 30_000);

  it('publishes the cover and packing list together and keeps their draft changes private', async () => {
    const { path, card, draft, route } = await prepareTrip();
    const cover = await tripCover('webp');
    const equipment = [{ label: 'Фонарь', required: true }];
    const withCover = await json<Draft>(await send('PATCH', path, owner, { trip_revision_id: draft.trip_revision_id, cover, equipment }), 200);
    const imagePath = `${card}/covers/${withCover.cover_id}`;
    expect((await send('GET', imagePath)).status).toBe(404);
    await publish(path, manifest(withCover, route));
    expect(await json<Card>(await send('GET', card), 200)).toMatchObject({ cover_id: withCover.cover_id, equipment });
    const visible = await send('GET', imagePath);
    expect(visible.status).toBe(200);
    expect(visible.headers.get('cache-control')).toContain('no-store');
    expect(visible.headers.get('x-content-type-options')).toBe('nosniff');
    expect(visible.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await visible.arrayBuffer()).toString('base64')).toBe(cover.data_base64);
    const current = await json<Draft>(await send('GET', path + '/draft', owner), 200);
    const cleared = await json<Draft>(await send('PATCH', path, owner, { trip_revision_id: current.trip_revision_id, cover: null, equipment: [] }), 200);
    expect((await send('GET', imagePath)).status).toBe(200);
    expect(await json<Card>(await send('GET', card), 200)).toMatchObject({ cover_id: withCover.cover_id, equipment });
    await publish(path, manifest(cleared, route));
    expect((await send('GET', imagePath)).status).toBe(404);
    expect(await json<Card>(await send('GET', card), 200)).toMatchObject({ cover_id: null, equipment: [] });
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
      cover: await tripCover('jpeg'),
    }), 200);
    await publish(path, manifest(future, route, [optional.poi_id]));
    const coverPath = card + '/covers/' + future.cover_id;
    const favorite = '/me/favorites/' + draft.trip_id;
    const collection = (name: string) => send('GET', '/me/trips?collection=' + name + '&query=' + draft.trip_id, visitor);
    await json(await send('PUT', favorite, visitor, { saved: true }), 200);
    expect((await json<Page>(await collection('favorites'), 200)).items).toMatchObject([{ trip_id: draft.trip_id, saved: true }]);
    expect((await send('GET', coverPath)).status).toBe(200);
    expect(await json(await send('POST', path + '/applications', visitor), 200)).toEqual({ status: 'pending' });
    expect((await json<Card>(await send('GET', card), 200)).pois.map(poi => poi.poi_id)).toEqual([optional.poi_id]);
    expect((await json<Page>(await collection('participation'), 200)).items).toMatchObject([{ trip_id: draft.trip_id, participation_status: 'pending' }]);
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
    await problem(await send('GET', coverPath), 'GET', publicCoverPath, 404, 'NOT_FOUND');
    await problem(await send('GET', card, visitor), 'GET', publicPath + '/{tripId}', 404, 'NOT_FOUND');
    await problem(await send('POST', path + '/applications', visitor), 'POST', applicationPath, 404, 'NOT_FOUND');
    expect(await json(await send('GET', participationPath + '?trip_ids=' + draft.trip_id, visitor), 200)).toEqual({
      viewer_id: visitor.id,
      trip_ids: [],
      joined_trip_ids: [],
      saved_trip_ids: [],
      owned_trip_ids: [],
    });
    expect((await json<Page>(await send('GET', `${publicPath}?q=${draft.trip_id}`), 200)).items).toHaveLength(0);
    for (const name of ['participation', 'favorites']) {
      expect((await json<Page>(await collection(name), 200)).items).toEqual([]);
    }
    expect(await json(await send('GET', favorite, visitor), 200)).toMatchObject({ saved: false });
    expect((await send('PUT', favorite, visitor, { saved: true })).status).toBe(404);
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
      expect(await json(response, 200)).toEqual({
        viewer_id: viewer,
        trip_ids: [],
        joined_trip_ids: [],
        saved_trip_ids: [],
        owned_trip_ids: [],
      });
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
    expect(await json(await send('GET', mine, visitor), 200)).toEqual({
      viewer_id: visitor.id,
      trip_ids: [],
      joined_trip_ids: [],
      saved_trip_ids: [],
      owned_trip_ids: [],
    });
    const replies = await Promise.all([send('POST', target, visitor, undefined, { key: false }), send('POST', target, visitor, {})]);
    for (const reply of replies) {
      expect(await json(reply, 200)).toEqual({ status: 'pending' });
    }
    expect(await json(await send('GET', mine, visitor), 200)).toEqual({
      viewer_id: visitor.id,
      trip_ids: [id],
      joined_trip_ids: [],
      saved_trip_ids: [],
      owned_trip_ids: [],
    });
    expect(await json(await send('GET', mine, moderator), 200)).toEqual({
      viewer_id: moderator.id,
      trip_ids: [],
      joined_trip_ids: [],
      saved_trip_ids: [],
      owned_trip_ids: [],
    });
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
      expect(await json(await send('GET', mine, visitor), 200)).toEqual({
        viewer_id: visitor.id,
        trip_ids: [],
        joined_trip_ids: [],
        saved_trip_ids: [],
        owned_trip_ids: [],
      });
    }
    finally {
      archive.mockRestore();
    }
  }, 30_000);

  it('lets only the owner manage applications, serializes the last seat and keeps decision retries tied to the original entry', async () => {
    const { draft, route, path } = await prepareTrip();
    const rosterPath = path + '/roster';
    const spec = contractTrip + '/roster';
    const decision = spec + '/{entryId}';
    const configured = await json<Draft>(await send('PATCH', path, owner, {
      trip_revision_id: draft.trip_revision_id,
      free_capacity: 1,
      start_date: '2200-01-01',
      end_date: null,
    }), 200);
    await publish(path, manifest(configured, route));
    for (const person of [visitor, moderator]) {
      expect((await send('POST', path + '/applications', person)).status).toBe(200);
    }
    type Roster = { items: { id: string; user_id: string; status: string }[]; occupied_slots: number; can_accept: boolean };
    const read = () => send('GET', rosterPath, owner).then(response => json<Roster>(response, 200));
    const pending = await read();
    expect(pending).toMatchObject({
      viewer_id: owner.id,
      occupied_slots: 0,
      can_accept: true,
      can_manage: true,
      capacity: 1,
    });
    expect(pending.items).toHaveLength(2);
    expect(pending.items).toEqual(expect.arrayContaining([expect.objectContaining({
      status: 'pending',
      user_id: visitor.id,
      profile: expect.objectContaining({ id: visitor.id, display_name: expect.any(String) }),
    })]));
    const responses = await Promise.all(pending.items.map(item => send('PUT', rosterPath + '/' + item.id, owner, { action: 'accept' })));
    const winningIndex = responses.findIndex(reply => reply.status === 204);
    expect(winningIndex).toBeGreaterThanOrEqual(0);
    await problem(responses[1 - winningIndex]!, 'PUT', decision, 409, 'TRIP_APPLICATION_UNAVAILABLE');
    const won = pending.items[winningIndex]!;
    const denied = pending.items[1 - winningIndex]!;
    const put = (entry: string, action: string) => send('PUT', rosterPath + '/' + entry, owner, { action });
    expect((await put(won.id, 'accept')).status).toBe(204);
    const full = await read();
    expect(full).toMatchObject({ occupied_slots: 1, can_accept: false });
    const member = full.items.find(entry => entry.status === 'joined')!;
    expect(member.user_id).toBe(won.user_id);
    await problem(await send('GET', rosterPath, moderator), 'GET', spec, 404, 'NOT_FOUND');
    await problem(await send('PUT', rosterPath + '/' + member.id, moderator, { action: 'remove' }), 'PUT', decision, 404, 'NOT_FOUND');
    await problem(await send('PUT', rosterPath + '/' + member.id, owner, { action: 'remove' }, { csrf: 'invalid' }), 'PUT', decision, 403, 'CSRF_REJECTED');
    for (let i = 0; i < 2; i++) {
      expect((await put(denied.id, 'decline')).status).toBe(204);
      expect((await put(member.id, 'remove')).status).toBe(204);
    }
    expect(await read()).toMatchObject({ occupied_slots: 0, can_accept: true, items: [] });
    const previous = won.user_id === visitor.id ? visitor : moderator;
    await json(await send('POST', path + '/applications', previous), 200);
    expect((await put(won.id, 'accept')).status).toBe(204);
    expect(await read()).toMatchObject({ occupied_slots: 0, items: [{ status: 'pending', user_id: previous.id }] });
  }, 20_000);

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
    expect(await json(await send('GET', myParticipation, winner), 200)).toEqual({
      viewer_id: winner.id,
      trip_ids: [],
      joined_trip_ids: [id],
      saved_trip_ids: [],
      owned_trip_ids: [],
    });
    const joined = await json<Page>(await send('GET', '/me/trips?collection=participation', winner), 200);
    expect(joined.items).toContainEqual(expect.objectContaining({ trip_id: id, participation_status: 'joined' }));
    expect(await json(await send('GET', card), 200)).toMatchObject({ applications_open: false, confirmed_participants: 1, free_capacity: 1 });
    const limitless = await edit({ free_capacity: null });
    await publish(path, manifest(limitless, route));
    for (const user of applicants) {
      expect(await json(await send('POST', join, user, { admission_mode: 'open' }), 200)).toEqual({ status: 'joined' });
      expect(await json(await send('GET', myParticipation, user), 200)).toEqual({
        viewer_id: user.id,
        trip_ids: [],
        joined_trip_ids: [id],
        saved_trip_ids: [],
        owned_trip_ids: [],
      });
    }
    const undersized = await edit({ free_capacity: 1 });
    const attempt = await json<Operation>(await send('POST', path + '/publish', owner, manifest(undersized, route)), 202);
    expect(await waitForOperation(path, attempt.operation_id)).toMatchObject({ status: 'failed', code: 'PUBLICATION_PRECONDITION_FAILED' });
    expect(await json(await send('GET', card), 200)).toMatchObject({ free_capacity: null, confirmed_participants: 2, applications_open: true });
    const closed = await edit({ visibility: 'private' });
    expect(closed.publication_id).toBeNull();
    expect(await json(await send('GET', myParticipation, winner), 200)).toEqual({
      viewer_id: winner.id,
      trip_ids: [],
      joined_trip_ids: [],
      saved_trip_ids: [],
      owned_trip_ids: [],
    });
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

  it('searches every owned page, isolates the owner and separates archived trips', async () => {
    const marker = randomUUID();
    const list = (query: string) => send('GET', '/me/trips?' + query, owner);
    const title = 'Сосновая долина';
    const selected = await json<Draft>(await send('POST', '/trips', owner, { title, description: marker, cover: await tripCover('png') }), 201);
    const another = await json<Draft>(await send('POST', '/trips', owner, { title: marker }), 201);
    await json(await send('POST', '/trips', visitor, { title: marker }), 201);
    const first = await json<Page>(await list('status=draft&query=' + marker + '&limit=1'), 200);
    const second = await json<Page>(await list('status=draft&query=' + marker + '&limit=1&cursor=' + first.next_cursor), 200);
    expect([first.items[0]!.trip_id, second.items[0]!.trip_id]).toEqual([selected.trip_id, another.trip_id].sort());
    expect(first.next_cursor).toBe(first.items[0]!.trip_id);
    expect(second.next_cursor).toBeNull();
    const upper = await json<Page>(await list('query=' + encodeURIComponent(title.toUpperCase())), 200);
    expect(upper.items.some(item => item.trip_id === selected.trip_id)).toBe(true);
    expect((await json<Page>(await list('status=published&query=' + marker), 200)).items).toEqual([]);
    await json(await send('POST', '/trips/' + selected.trip_id + '/archive', owner, { trip_revision_id: selected.trip_revision_id }), 200);
    const archived = await json<Page>(await list('status=archived&query=' + marker), 200);
    expect(archived).toMatchObject({ viewer_id: owner.id, items: [{
      trip_id: selected.trip_id,
      archived: true,
      cover_id: selected.cover_id,
      day_count: 1,
    }] });
    expect((await json<Page>(await list('query=' + marker), 200)).items.map(item => item.trip_id)).toEqual([another.trip_id]);
    const cover = '/trips/' + selected.trip_id + '/covers/' + selected.cover_id;
    expect((await send('GET', cover, owner)).status).toBe(200);
    expect((await send('GET', cover, visitor)).status).toBe(404);
    expect((await send('GET', '/me/trips?collection=favorites&status=draft', owner)).status).toBe(400);
  });

  it('keeps favorites private, returns only the pinned public card and supports removal after withdrawal', async () => {
    const marker = randomUUID();
    const { draft, route, path } = await prepareTrip(undefined, positions[0], 'В сосновый бор ' + marker);
    const favorite = '/me/favorites/' + draft.trip_id;
    const list = (collection: string, status = 'all') => send('GET', '/me/trips?' + new URLSearchParams({ collection, status, query: marker }), visitor);
    const ownedList = (status: string) => send('GET', '/me/trips?' + new URLSearchParams({ collection: 'created', status, query: marker }), owner)
      .then(response => json<Page>(response, 200));
    expect((await send('PUT', favorite, visitor, { saved: true })).status).toBe(404);
    const future = await json<Draft>(await send('PATCH', path, owner, {
      trip_revision_id: draft.trip_revision_id,
      start_date: '2200-01-01',
      end_date: '2200-01-01',
      free_capacity: null,
    }), 200);
    const operation = await publish(path, manifest(future, route));
    await problem(await send('PUT', favorite, owner, { saved: true }), 'PUT', '/me/favorites/{tripId}', 409, 'TRIP_FAVORITE_OWN');
    const viewerContext = participationPath + '?trip_ids=' + draft.trip_id;
    expect(await json(await send('GET', viewerContext, owner), 200)).toMatchObject({ owned_trip_ids: [draft.trip_id], saved_trip_ids: [] });
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(await json(await send('PUT', favorite, visitor, { saved: true }), 200)).toEqual({ viewer_id: visitor.id, saved: true });
    }
    const own = await json<Draft>(await send('POST', '/trips', visitor, { title: marker }), 201);
    const first = await json<Page>(await send('GET', '/me/trips?query=' + marker + '&limit=1', visitor), 200);
    const next = await json<Page>(await send('GET', '/me/trips?query=' + marker + '&limit=1&cursor=' + first.next_cursor, visitor), 200);
    expect(first.next_cursor).toBe(first.items[0]?.trip_id);
    expect(next.next_cursor).toBeNull();
    expect([...first.items, ...next.items].map(item => item.trip_id)).toEqual([own.trip_id, draft.trip_id].sort());
    const active = await json<Draft>(await send('GET', path + '/draft', owner), 200);
    const updated = await json<Draft>(await send('PATCH', path, owner, { title: 'Новое приватное название ' + marker, free_capacity: 2, trip_revision_id: active.trip_revision_id }), 200);
    expect((await ownedList('published')).items).toMatchObject([{ trip_id: draft.trip_id, free_capacity: null }]);
    expect(await json(await send('GET', path + '/roster', owner), 200)).toMatchObject({ capacity: null });
    expect((await json<Page>(await list('favorites'), 200)).items).toMatchObject([{
      trip_id: draft.trip_id,
      title: 'В сосновый бор ' + marker,
      publication_id: operation.publication_id,
      saved: true,
      archived: false,
      participation_status: null,
    }]);
    expect(await json(await send('GET', favorite, owner), 200)).toMatchObject({ viewer_id: owner.id, saved: false });
    expect((await json<Page>(await list('participation'), 200)).items).toEqual([]);
    await json(await send('POST', path + '/applications', visitor), 200);
    expect(await json(await send('GET', viewerContext, visitor), 200)).toMatchObject({ saved_trip_ids: [draft.trip_id], trip_ids: [draft.trip_id] });
    expect((await json<Page>(await list('all'), 200)).items.filter(item => item.trip_id === draft.trip_id)).toMatchObject([{
      trip_id: draft.trip_id,
      is_owner: false,
      saved: true,
      participation_status: 'pending',
    }]);
    expect((await json<Page>(await list('pending'), 200)).items).toMatchObject([{ trip_id: draft.trip_id }]);
    expect((await json<Page>(await list('joined'), 200)).items).toEqual([]);
    await server.app.get(TravelDatabase).transaction(client => client.query(
      'UPDATE travel.trips SET lifecycle = \'completed\' WHERE id = $1', [draft.trip_id],
    ));
    for (const collection of ['created', 'favorites', 'participation']) {
      const viewer = collection === 'created' ? owner : visitor;
      const completed = await json<Page>(await send('GET', '/me/trips?status=completed&collection=' + collection, viewer), 200);
      expect(completed.items).toContainEqual(expect.objectContaining({ trip_id: draft.trip_id, lifecycle: 'completed', publication_id: operation.publication_id }));
    }
    expect((await json<Page>(await list('favorites', 'in_progress'), 200)).items).toEqual([]);
    await json(await send('POST', path + '/unpublish', owner, { trip_revision_id: updated.trip_revision_id, publication_id: operation.publication_id }), 200);
    expect((await ownedList('completed')).items).toEqual([]);
    expect((await ownedList('draft')).items).toMatchObject([{ trip_id: draft.trip_id, publication_id: null, free_capacity: 2 }]);
    expect(await json(await send('GET', favorite, visitor), 200)).toMatchObject({ saved: false });
    expect((await json<Page>(await list('favorites'), 200)).items).toEqual([]);
    expect(await json(await send('PUT', favorite, visitor, { saved: false }), 200)).toMatchObject({ saved: false });
  }, 20_000);

  it('checks the HTTP status and problem code declared for each publication operation', async () => {
    const { draft, route, path, card } = await prepareTrip();
    const down = await start(process.env.TROPIO_GEO_TEST_DATABASE_URL!, process.env.TROPIO_IDENTITY_TEST_DATABASE_URL!,
      'postgresql://127.0.0.1:1/unavailable');
    const request = manifest(draft, route);
    const favorite = '/me/favorites/' + draft.trip_id;
    const favoriteSpec = '/me/favorites/{tripId}';
    await problem(await send('GET', '/me/trips'), 'GET', '/me/trips', 401, 'SESSION_REQUIRED');
    await problem(await send('GET', '/me/trips?status=unknown', owner), 'GET', '/me/trips', 400, 'INVALID_REQUEST');
    await problem(await send('GET', '/me/trips', owner, undefined, { server: down }), 'GET', '/me/trips', 503, 'DEPENDENCY_UNAVAILABLE');
    for (const method of ['GET', 'PUT'] as const) {
      const body = method === 'PUT' ? { saved: true } : undefined;
      await problem(await send(method, favorite, undefined, body), method, favoriteSpec, 401, 'SESSION_REQUIRED');
      await problem(await send(method, '/me/favorites/invalid', visitor, body), method, favoriteSpec, 400, 'INVALID_REQUEST');
      await problem(await send(method, favorite, visitor, body, { server: down }), method, favoriteSpec, 503, 'DEPENDENCY_UNAVAILABLE');
    }
    await problem(await send('PUT', favorite, visitor, { saved: true }), 'PUT', favoriteSpec, 404, 'NOT_FOUND');
    await problem(await send('PUT', favorite, visitor, { saved: true }, { csrf: 'invalid' }), 'PUT', favoriteSpec, 403, 'CSRF_REJECTED');
    expect((await send('PUT', favorite, visitor, { saved: 'true' })).status).toBe(400);
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
        target: path + '/roster',
        spec: contractTrip + '/roster',
        bad: '/trips/bad/roster',
      },
      {
        method: 'PUT',
        target: path + '/roster/' + randomUUID(),
        spec: contractTrip + '/roster/{entryId}',
        bad: path + '/roster/bad',
        body: { action: 'decline' },
      },
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
        target: card + '/covers/' + randomUUID(),
        spec: publicCoverPath,
        bad: card + '/covers/bad',
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
    expect([...seen].sort()).toEqual([...declaredErrors('Travel publications'), ...declaredErrors('Travel participation'), ...declaredErrors('Account trips')].sort());
  }, 30_000);
});
