import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import type { NestNodeApplication } from '@nestjs/platform-node';
import pg from 'pg';
import {
  afterAll,
  beforeAll,
  expect,
  it,
  vi,
} from 'vitest';
import account from '../../fixtures/demo-account.json' with { type: 'json' };
import versionOne from '../../fixtures/demo/0001-travel.json' with { type: 'json' };
import equipmentVersion from '../../fixtures/demo/0002-equipment.json' with { type: 'json' };
import personalVersion from '../../fixtures/demo/0003-personal-equipment.json' with { type: 'json' };
import collectionsVersion from '../../fixtures/demo/0004-personal-trips.json' with { type: 'json' };
import travelersVersion from '../../fixtures/demo/0005-personal-travelers.json' with { type: 'json' };
import journeysVersion from '../../fixtures/demo/0006-personal-journeys.json' with { type: 'json' };
import avatarsVersion from '../../fixtures/demo/0007-personal-avatars.json' with { type: 'json' };
import { ensureLocalDemoAccount } from '../local/demo-account.mts';
import { applyLocalDemoData } from '../local/demo-data.mjs';
import { applyTravelDemoVersion } from '../local/travel-demo.js';
import { createApplication } from '../src/create-application.js';
import { TravelService } from '../src/travel/travel.service.js';

interface Trip {
  trip_id: string;
  trip_revision_id: string;
  publication_id: string | null;
  title: string;
}

interface Card {
  trip_id: string;
  organizer: { id: string; display_name: string };
  days: { lines: { coordinates: number[][] }[] }[];
}

const origin = 'http://127.0.0.1:3000';
const databases = {
  identityUrl: process.env.TROPIO_IDENTITY_TEST_DATABASE_URL!,
  travelUrl: process.env.TROPIO_TRAVEL_TEST_DATABASE_URL!,
  geoUrl: process.env.TROPIO_GEO_TEST_DATABASE_URL!,
};
let app: NestNodeApplication;
let base: string;
let fixtureDirectory: string;
let auth: { 'cookie': string; 'x-csrf-token': string };

interface LibraryItem {
  id: string;
  label: string;
  scope: string;
  icon?: string;
  group?: { id: string; label: string };
  subgroup?: { id: string; label: string };
}

async function read<T>(path: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(base + path, { headers });
  expect(response.status, path).toBe(200);
  return response.json() as Promise<T>;
}

async function session(owner: { id: string; email: string; password: string }) {
  const login = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: owner.email, password: owner.password }),
  });
  expect(login.status).toBe(200);
  const profile = await login.json() as { id: string; csrf_token: string };
  expect(profile.id).toBe(owner.id);
  const cookie = login.headers.getSetCookie()[0]?.split(';')[0];
  if (!cookie) {
    throw new Error('Missing Identity session cookie');
  }
  return { cookie, 'x-csrf-token': profile.csrf_token };
}

async function personalInventory(headers = auth) {
  const { items } = await read<{ items: LibraryItem[] }>('/me/equipment', headers);
  return items.filter(item => item.scope === 'personal');
}

beforeAll(async () => {
  if (Object.values(databases).some(value => !value)) {
    throw new Error('Use pnpm db:test:demo');
  }
  fixtureDirectory = await mkdtemp(join(tmpdir(), 'tropio-demo-test-'));
  await copyFile(new URL('../../fixtures/demo/0001-travel.json', import.meta.url), join(fixtureDirectory, '0001-travel.json'));
  expect(await Promise.all([
    applyLocalDemoData(databases, fixtureDirectory), applyLocalDemoData(databases, fixtureDirectory),
  ])).toEqual([true, true]);
  app = await createApplication({ logger: false }, { databaseUrl: databases.identityUrl, browserOrigin: origin }, {
    databaseUrl: databases.travelUrl,
    publicationWorker: false,
  }, { databaseUrl: databases.geoUrl });
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()) + '/api/v1';
  auth = await session(account);
}, 120_000);

afterAll(async () => {
  await app?.close();
  if (fixtureDirectory) {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});

it('serves all eleven published trips with their organizer and day routes', async () => {
  const expected = versionOne.trips.filter(trip => trip.status === 'published');
  expect(expected.filter(trip => trip.owner === 'company')).toHaveLength(10);
  expect(expected).toHaveLength(11);
  const catalog = await read<{ items: Card[]; next_cursor: string | null }>('/catalog/trips?limit=30');
  expect(catalog.next_cursor).toBeNull();
  expect(catalog.items.map(card => card.trip_id).sort()).toEqual(expected.map(trip => trip.id).sort());

  for (const trip of expected) {
    const organizer = trip.owner === 'company' ? versionOne.organizer : account;
    const card = await read<Card>('/catalog/trips/' + trip.id);
    expect(card).toMatchObject({ title: trip.title, organizer: { id: organizer.id, display_name: organizer.displayName } });
    expect(card.days).toHaveLength(trip.days.length);
    for (const day of card.days) {
      expect(day.lines.length).toBeGreaterThan(0);
      expect(day.lines[0]?.coordinates.length).toBeGreaterThanOrEqual(2);
    }
  }
}, 30_000);

it('keeps both personal trips and preserves a private draft edit when run again', async () => {
  const list = await read<{ items: Trip[] }>('/trips', auth);
  const personal = versionOne.trips.filter(trip => trip.owner === 'traveler');
  expect(list.items).toHaveLength(2);
  expect(list.items.map(trip => trip.trip_id).sort()).toEqual(personal.map(trip => trip.id).sort());
  const drafts = list.items.filter(trip => trip.publication_id === null);
  expect(drafts).toHaveLength(1);
  const draft = drafts[0]!;
  expect(draft.trip_id).toBe(personal.find(trip => trip.status === 'draft')?.id);
  expect((await fetch(base + '/catalog/trips/' + draft.trip_id)).status).toBe(404);
  expect((await fetch(base + '/trips/' + draft.trip_id + '/draft')).status).toBe(401);

  const title = 'Мой план после первого входа';
  const patch = await fetch(base + '/trips/' + draft.trip_id, {
    method: 'PATCH',
    headers: {
      ...auth,
      origin,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify({ trip_revision_id: draft.trip_revision_id, title }),
  });
  expect(patch.status).toBe(200);
  const changed = await patch.json() as Trip;
  expect(await applyLocalDemoData(databases, fixtureDirectory)).toBe(true);
  expect(await read<Trip>('/trips/' + draft.trip_id + '/draft', auth))
    .toMatchObject({ title, trip_revision_id: changed.trip_revision_id, publication_id: null });
  expect((await read<{ items: Trip[] }>('/trips', auth)).items).toHaveLength(2);
}, 30_000);

it('preserves the previous draft on upgrade and publishes the equipment snapshot', async () => {
  await copyFile(new URL('../../fixtures/demo/0002-equipment.json', import.meta.url), join(fixtureDirectory, '0002-equipment.json'));
  const existing = versionOne.trips.find(trip => trip.owner === 'traveler' && trip.status === 'draft')!;
  const previousDraft = await read<Trip>(`/trips/${existing.id}/draft`, auth);
  await applyLocalDemoData(databases, fixtureDirectory);
  expect(await read<Trip>(`/trips/${existing.id}/draft`, auth)).toEqual(previousDraft);
  const equipped = equipmentVersion.trips[0]!;
  expect(await read<Card>('/catalog/trips/' + equipped.id)).toMatchObject({ equipment: equipped.equipment, cover_id: null });
}, 120_000);

it('adds six private equipment variants without changing existing inventory, trips or publications', async () => {
  const original = await personalInventory();
  expect(original).toEqual([]);
  const tripList = await read('/trips', auth);
  const catalog = await read('/catalog/trips?limit=30');
  const collision = personalVersion.personalEquipment.find(item => item.group && !item.subgroup && !item.icon)!;
  const manualResponse = await fetch(base + '/me/equipment', {
    method: 'POST',
    headers: {
      ...auth,
      origin,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify({ label: collision.label }),
  });
  expect(manualResponse.status).toBe(201);
  const manual = await manualResponse.json() as LibraryItem;
  await copyFile(new URL('../../fixtures/demo/0003-personal-equipment.json', import.meta.url), join(fixtureDirectory, '0003-personal-equipment.json'));
  expect(await applyLocalDemoData(databases, fixtureDirectory)).toBe(true);
  const items = await personalInventory();
  expect(items).toHaveLength(7);
  expect(items.find(item => item.id === manual.id)).toEqual(manual);
  const examples = items.filter(item => item.id !== manual.id);
  const groups = new Set<string>();
  const subgroups = new Set<string>();
  for (const expected of personalVersion.personalEquipment) {
    const label = expected.label === collision.label ? expected.label + ' (пример)' : expected.label;
    const item = examples.find(entry => entry.label === label);
    expect(item, label).toBeDefined();
    expect(item?.icon).toBe(expected.icon);
    expect(item?.group?.label).toBe(expected.group?.label);
    expect(item?.subgroup?.label).toBe(expected.subgroup?.label);
    if (item?.group) {
      groups.add(item.group.id);
    }
    if (item?.subgroup) {
      subgroups.add(item.subgroup.id);
    }
  }
  expect(groups.size).toBe(1);
  expect(subgroups.size).toBe(1);
  expect(await applyLocalDemoData(databases, fixtureDirectory)).toBe(true);
  expect(await personalInventory()).toEqual(items);
  expect(await read('/trips', auth)).toEqual(tripList);
  expect(await read('/catalog/trips?limit=30')).toEqual(catalog);
  const visitor = {
    id: randomUUID(),
    email: 'second-traveler@example.test',
    displayName: 'Путешественник',
    password: 'visitor-demo-test-password',
  };
  expect(await ensureLocalDemoAccount(databases.identityUrl, visitor)).toBe(true);
  expect(await personalInventory(await session(visitor))).toEqual([]);
}, 120_000);

it('adds a private archive, visible favorites and eligible participation once on upgrade', async () => {
  const { archive, favorites, participation } = collectionsVersion.accountTrips;
  const catalogIds = async () => (await read<{ items: Card[] }>('/catalog/trips?limit=30')).items.map(item => item.trip_id).sort();
  const before = await catalogIds();
  const current = await read('/trips', auth);
  const eligible = [];
  for (const entry of participation) {
    const trip = await read<{ applications_open: boolean }>(`/catalog/trips/${entry.tripId}`);
    if (trip.applications_open) {
      eligible.push({ trip_id: entry.tripId, participation_status: entry.mode === 'open' ? 'joined' : 'pending' });
    }
  }
  await copyFile(new URL('../../fixtures/demo/0004-personal-trips.json', import.meta.url), join(fixtureDirectory, '0004-personal-trips.json'));
  await applyLocalDemoData(databases, fixtureDirectory);
  const archived = await read<{ items: Trip[] }>('/me/trips?collection=created&status=archived', auth);
  expect(archived.items).toHaveLength(1);
  expect(archived.items[0]).toMatchObject({ trip_id: archive.id, title: archive.title, archived: true });
  expect((await fetch(base + '/catalog/trips/' + archive.id)).status).toBe(404);
  expect(await read('/trips', auth)).toEqual(current);
  expect(await catalogIds()).toEqual(before);
  const membership = await read<{ items: Trip[] }>('/me/trips?collection=participation', auth);
  expect(membership.items).toHaveLength(eligible.length);
  for (const item of eligible) {
    expect(membership.items.find(trip => trip.trip_id === item.trip_id)).toMatchObject(item);
  }
  const saved = await read<{ items: Trip[] }>('/me/trips?collection=favorites', auth);
  expect(saved.items.map(item => item.trip_id).sort()).toEqual([...favorites].sort());
  const remove = await fetch(base + '/me/favorites/' + favorites[0], {
    method: 'PUT',
    headers: { ...auth, origin, 'content-type': 'application/json' },
    body: JSON.stringify({ saved: false }),
  });
  expect(remove.status).toBe(200);
  await applyLocalDemoData(databases, fixtureDirectory);
  expect(await read('/me/trips?collection=favorites', auth)).toMatchObject({ items: [] });
  expect(await read('/me/trips?collection=created&status=archived', auth)).toEqual(archived);
  expect(await read('/me/trips?collection=participation', auth)).toMatchObject({
    items: membership.items.map(trip => ({ trip_id: trip.trip_id })),
  });
}, 120_000);

it('creates the demo profiles before seeding all personal trip states and an editable group', async () => {
  async function install(filename: string) {
    await copyFile(new URL('../../fixtures/demo/' + filename, import.meta.url), join(fixtureDirectory, filename));
    expect(await applyLocalDemoData(databases, fixtureDirectory)).toBe(true);
  }
  async function cards(collection: string, status = 'all') {
    const { items } = await read<{ items: (Trip & { saved: boolean; participation_status: string | null })[] }>(
      `/me/trips?collection=${collection}&status=${status}&limit=100`, auth,
    );
    return items;
  }
  const originalCatalog = await read<{ items: Card[] }>('/catalog/trips?limit=100');
  const personalDraft = versionOne.trips.find(item => item.owner === 'traveler' && item.status === 'draft')!;
  const previousDraft = await read('/trips/' + personalDraft.id + '/draft', auth);
  await install('0005-personal-travelers.json');
  for (const user of travelersVersion.travelers) {
    expect(await read('/users/' + user.id)).toMatchObject({ id: user.id, display_name: user.displayName });
  }
  expect(await read('/catalog/trips?limit=100')).toEqual(originalCatalog);
  await install('0006-personal-journeys.json');
  const all = await cards('all');
  expect(new Set(all.map(item => item.trip_id)).size).toBe(all.length);
  const expected = journeysVersion.journeys;
  const catalog = await read<{ items: Card[] }>('/catalog/trips?limit=100');
  expect(catalog.items.map(item => item.trip_id).sort()).toEqual([
    ...originalCatalog.items.map(item => item.trip_id), ...expected.map(item => item.id),
  ].sort());
  for (const trip of expected) {
    expect(all.find(item => item.trip_id === trip.id)).toMatchObject({
      title: trip.title,
      lifecycle: trip.lifecycle,
      saved: trip.favorite ?? false,
      participation_status: trip.confirmed?.includes(account.id) ? 'joined' : trip.pending?.includes(account.id) ? 'pending' : null,
    });
    expect(await read('/catalog/trips/' + trip.id)).toMatchObject({ lifecycle: trip.lifecycle });
  }
  for (const collection of ['created', 'joined']) {
    for (const status of ['published', 'starting_soon', 'in_progress', 'completed', 'cancelled']) {
      expect(await cards(collection, status), collection + '/' + status).not.toHaveLength(0);
    }
  }
  expect(await cards('created', 'draft')).toEqual(expect.arrayContaining([expect.objectContaining({ trip_id: personalDraft.id })]));
  expect(await cards('created', 'archived')).toEqual(expect.arrayContaining([
    expect.objectContaining({ trip_id: collectionsVersion.accountTrips.archive.id }),
  ]));
  const group = expected.find(trip => trip.ownerId === account.id && trip.confirmed?.length && trip.pending?.length)!;
  type Roster = { items: { id: string; user_id: string; status: string; profile: { display_name: string } }[] };
  const rosterPath = '/trips/' + group.id + '/roster';
  const roster = await read<Roster>(rosterPath, auth);
  expect(roster.items).toHaveLength(4);
  for (const user of travelersVersion.travelers) {
    expect(roster.items.find(entry => entry.user_id === user.id)).toMatchObject({
      status: group.confirmed!.includes(user.id) ? 'joined' : 'pending',
      profile: { display_name: user.displayName },
    });
  }
  const removed = roster.items.find(entry => entry.status === 'joined')!;
  const headers = { ...auth, origin, 'content-type': 'application/json' };
  expect((await fetch(base + rosterPath + '/' + removed.id, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ action: 'remove' }),
  })).status).toBe(204);
  const saved = expected.find(trip => trip.favorite)!;
  expect((await fetch(base + '/me/favorites/' + saved.id, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ saved: false }),
  })).status).toBe(200);
  const interrupted = new pg.Client({ connectionString: databases.travelUrl });
  await interrupted.connect();
  try {
    await interrupted.query('SET ROLE tropio_travel_runtime');
    const audit = await interrupted.query(
      'SELECT trip_id FROM travel.trip_audit_events WHERE action LIKE \'trip.lifecycle.%\' ORDER BY trip_id',
    );
    expect(audit.rows.map(row => row.trip_id)).toEqual(expected.filter(item => item.lifecycle !== 'planned').map(item => item.id).sort());
    await interrupted.query('UPDATE travel.local_demo_versions SET applied_at = NULL WHERE version = 6');
  }
  finally {
    await interrupted.end();
  }
  await applyLocalDemoData(databases, fixtureDirectory);
  expect((await read<Roster>(rosterPath, auth)).items.map(entry => entry.user_id)).not.toContain(removed.user_id);
  expect((await cards('all')).map(item => item.trip_id)).not.toContain(saved.id);
  expect(await read('/trips/' + personalDraft.id + '/draft', auth)).toEqual(previousDraft);
}, 120_000);

it('updates only untouched demo avatars and preserves choices across an interrupted upgrade', async () => {
  type Avatar = { id: string; url: string };
  async function choose(headers: typeof auth, id: string) {
    expect((await fetch(base + '/me/avatar', {
      method: 'PATCH',
      headers: { ...headers, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ avatar_id: id }),
    })).status).toBe(200);
  }
  const { items } = await read<{ items: Avatar[] }>('/avatar-assets');
  const readAvatar = async (id: string) => (await read<{ avatar: Avatar }>('/users/' + id)).avatar;
  const traveler = travelersVersion.travelers[0]!;
  const manualUser = { ...traveler, password: 'test-custom-avatar-password' };
  expect(await ensureLocalDemoAccount(databases.identityUrl, manualUser)).toBe(true);
  const manualAuth = await session(manualUser);
  const selected = items.find(item => item.url === '/avatars/avatar_12.png')!;
  const original = items.find(item => item.id === avatarsVersion.initialAvatarId)!;
  await choose(manualAuth, selected.id);
  await choose(auth, selected.id);
  const filename = '0007-personal-avatars.json';
  await copyFile(new URL('../../fixtures/demo/' + filename, import.meta.url), join(fixtureDirectory, filename));
  expect(await applyLocalDemoData(databases, fixtureDirectory)).toBe(true);
  for (const { userId, avatarId } of avatarsVersion.avatars) {
    expect(await readAvatar(userId)).toEqual(userId === traveler.id ? selected : items.find(item => item.id === avatarId));
  }
  expect(await readAvatar(account.id)).toEqual(selected);
  await choose(manualAuth, original.id);
  const interrupted = new pg.Client({ connectionString: databases.travelUrl });
  await interrupted.connect();
  try {
    await interrupted.query('SET ROLE tropio_travel_runtime');
    await interrupted.query('UPDATE travel.local_demo_versions SET applied_at = NULL WHERE version = 7');
  }
  finally {
    await interrupted.end();
  }
  expect(await applyLocalDemoData(databases, fixtureDirectory)).toBe(true);
  expect(await readAvatar(traveler.id)).toEqual(original);
  expect(await readAvatar(account.id)).toEqual(selected);
}, 120_000);

it('resumes an interrupted new version and rejects changes to its original file', async () => {
  const organizer = { id: randomUUID(), email: 'next-organizer@tropio.test', displayName: 'Следующий организатор' };
  const trip = {
    ...versionOne.trips[0],
    id: randomUUID(),
    slug: 'next-organizer-draft',
    owner: 'company',
    status: 'draft',
  };
  const content = JSON.stringify({ version: 8, organizer, trips: [trip] });
  const file = join(fixtureDirectory, '0008-add-trip.json');
  await writeFile(file, content);
  const missingGeo = new URL(databases.geoUrl);
  missingGeo.pathname = '/unavailable_demo_' + randomUUID().replaceAll('-', '');
  await expect(applyLocalDemoData({ ...databases, geoUrl: missingGeo.href }, fixtureDirectory)).rejects.toThrow();
  const travel = new pg.Client({ connectionString: databases.travelUrl });
  await travel.connect();
  try {
    await travel.query('SET ROLE tropio_travel_runtime');
    const history = () => travel.query('SELECT version, applied_at FROM travel.local_demo_versions ORDER BY version');
    expect((await history()).rows).toEqual([
      { version: 1, applied_at: expect.any(Date) }, { version: 2, applied_at: expect.any(Date) },
      { version: 3, applied_at: expect.any(Date) }, { version: 4, applied_at: expect.any(Date) },
      { version: 5, applied_at: expect.any(Date) }, { version: 6, applied_at: expect.any(Date) }, { version: 7, applied_at: expect.any(Date) },
      { version: 8, applied_at: null },
    ]);
    expect((await travel.query('SELECT id FROM travel.trips WHERE owner_user_id = $1', [organizer.id])).rows)
      .toEqual([{ id: trip.id }]);
    await writeFile(file, content + '\n');
    await expect(applyLocalDemoData(databases, fixtureDirectory)).rejects.toThrow(/История локальных демонстрационных данных/);
    await writeFile(file, content);
    await expect(applyLocalDemoData(databases, fixtureDirectory)).resolves.toBe(true);
    expect((await history()).rows[7]).toEqual({ version: 8, applied_at: expect.any(Date) });
    expect((await travel.query('SELECT id FROM travel.trips WHERE owner_user_id = $1', [organizer.id])).rows)
      .toEqual([{ id: trip.id }]);
    expect(await read<{ id: string }>(`/users/${organizer.id}`)).toMatchObject({ id: organizer.id, display_name: organizer.displayName });
  }
  finally {
    await travel.end();
  }
}, 120_000);

it('resumes before scheduling without reviving removed relationships or undoing manual edits and archives', async () => {
  const template = journeysVersion.journeys[0]!;
  const group = {
    ...template,
    id: randomUUID(),
    admissionMode: 'request',
    lifecycle: 'planned',
  } as const;
  const saved = {
    ...group,
    id: randomUUID(),
    ownerId: travelersVersion.travelers[0]!.id,
    confirmed: [],
    pending: [],
    favorite: true,
  };
  const archived = {
    ...group,
    id: randomUUID(),
    confirmed: [],
    pending: [],
  };
  const edited = { ...archived, id: randomUUID() };
  const remaining = { ...archived, id: randomUUID() };
  const version = 9;
  const context = { ...databases, travelerId: account.id, startedAt: new Date() };
  const interrupted = [group, saved, archived, edited];
  const original = TravelService.prototype.updateTrip;
  const pause = vi.spyOn(TravelService.prototype, 'updateTrip').mockImplementation(function (this: TravelService, ...args) {
    if (args[3].patch.start_date) {
      throw new Error('Interrupted before scheduling');
    }
    return original.apply(this, args);
  });
  try {
    for (const journey of interrupted) {
      await expect(applyTravelDemoVersion(context, { version, journeys: [journey] })).rejects.toThrow('Interrupted before scheduling');
    }
  }
  finally {
    pause.mockRestore();
  }
  const headers = { ...auth, origin, 'content-type': 'application/json' };
  const rosterPath = '/trips/' + group.id + '/roster';
  type Entry = { id: string; user_id: string; status: string };
  const { items } = await read<{ items: Entry[] }>(rosterPath, auth);
  const removed = items.find(item => item.status === 'joined')!;
  const declined = items.find(item => item.status === 'pending')!;
  for (const [entry, action] of [[removed, 'remove'], [declined, 'decline']] as const) {
    expect((await fetch(base + rosterPath + '/' + entry.id, { method: 'PUT', headers, body: JSON.stringify({ action }) })).status).toBe(204);
  }
  const favoritePath = '/me/favorites/' + saved.id;
  expect(await read(favoritePath, auth)).toMatchObject({ saved: true });
  expect((await fetch(base + favoritePath, { method: 'PUT', headers, body: JSON.stringify({ saved: false }) })).status).toBe(200);
  const title = 'Мои изменения до переноса дат';
  for (const trip of [archived, edited]) {
    const path = '/trips/' + trip.id;
    const draft = await read<Trip & { start_date: string | null }>(path + '/draft', auth);
    expect(draft.start_date).toBeNull();
    const archive = trip === archived;
    expect((await fetch(base + path + (archive ? '/archive' : ''), {
      method: archive ? 'POST' : 'PATCH',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      body: JSON.stringify({ trip_revision_id: draft.trip_revision_id, ...(!archive && { title }) }),
    })).status).toBe(200);
  }
  await writeFile(join(fixtureDirectory, '0009-personal-journeys.json'), JSON.stringify({ version, journeys: [...interrupted, remaining] }));
  expect(await applyLocalDemoData(databases, fixtureDirectory)).toBe(true);
  const after = await read<{ items: Entry[] }>(rosterPath, auth);
  expect(after.items).toEqual(items.filter(entry => entry.id !== removed.id && entry.id !== declined.id));
  expect(await read(favoritePath, auth)).toMatchObject({ saved: false });
  expect(await read('/trips/' + edited.id + '/draft', auth)).toMatchObject({ title, start_date: null });
  expect((await fetch(base + '/catalog/trips/' + archived.id)).status).toBe(404);
  expect(await read('/trips/' + remaining.id + '/draft', auth)).toMatchObject({ start_date: expect.any(String) });
}, 120_000);
