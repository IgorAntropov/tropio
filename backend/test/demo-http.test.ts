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
} from 'vitest';
import account from '../../fixtures/demo-account.json' with { type: 'json' };
import versionOne from '../../fixtures/demo/0001-travel.json' with { type: 'json' };
import equipmentVersion from '../../fixtures/demo/0002-equipment.json' with { type: 'json' };
import personalVersion from '../../fixtures/demo/0003-personal-equipment.json' with { type: 'json' };
import { ensureLocalDemoAccount } from '../local/demo-account.mts';
import { applyLocalDemoData } from '../local/demo-data.mjs';
import { createApplication } from '../src/create-application.js';

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

it('resumes an interrupted new version and rejects changes to its original file', async () => {
  const organizer = { id: randomUUID(), email: 'next-organizer@tropio.test', displayName: 'Следующий организатор' };
  const trip = {
    ...versionOne.trips[0],
    id: randomUUID(),
    slug: 'next-organizer-draft',
    owner: 'company',
    status: 'draft',
  };
  const content = JSON.stringify({ version: 4, organizer, trips: [trip] });
  const file = join(fixtureDirectory, '0004-add-trip.json');
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
      { version: 3, applied_at: expect.any(Date) }, { version: 4, applied_at: null },
    ]);
    expect((await travel.query('SELECT id FROM travel.trips WHERE owner_user_id = $1', [organizer.id])).rows)
      .toEqual([{ id: trip.id }]);
    await writeFile(file, content + '\n');
    await expect(applyLocalDemoData(databases, fixtureDirectory)).rejects.toThrow(/История локальных демонстрационных данных/);
    await writeFile(file, content);
    await expect(applyLocalDemoData(databases, fixtureDirectory)).resolves.toBe(true);
    expect((await history()).rows[3]).toEqual({ version: 4, applied_at: expect.any(Date) });
    expect((await travel.query('SELECT id FROM travel.trips WHERE owner_user_id = $1', [organizer.id])).rows)
      .toEqual([{ id: trip.id }]);
    expect(await read<{ id: string }>(`/users/${organizer.id}`)).toMatchObject({ id: organizer.id, display_name: organizer.displayName });
  }
  finally {
    await travel.end();
  }
}, 120_000);
