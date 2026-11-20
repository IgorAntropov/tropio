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

async function read<T>(path: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(base + path, { headers });
  expect(response.status, path).toBe(200);
  return response.json() as Promise<T>;
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
  const login = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  expect(login.status).toBe(200);
  const profile = await login.json() as { id: string; csrf_token: string };
  expect(profile.id).toBe(account.id);
  const cookie = login.headers.getSetCookie()[0]?.split(';')[0];
  if (!cookie) {
    throw new Error('Missing Identity session cookie');
  }
  auth = { cookie, 'x-csrf-token': profile.csrf_token };
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

it('resumes an interrupted new version and rejects changes to its original file', async () => {
  const organizer = { id: randomUUID(), email: 'next-organizer@tropio.test', displayName: 'Следующий организатор' };
  const trip = {
    ...versionOne.trips[0],
    id: randomUUID(),
    slug: 'next-organizer-draft',
    owner: 'company',
    status: 'draft',
  };
  const content = JSON.stringify({ version: 2, organizer, trips: [trip] });
  const file = join(fixtureDirectory, '0002-add-trip.json');
  await writeFile(file, content);
  const missingGeo = new URL(databases.geoUrl);
  missingGeo.pathname = '/unavailable_demo_' + randomUUID().replaceAll('-', '');
  await expect(applyLocalDemoData({ ...databases, geoUrl: missingGeo.href }, fixtureDirectory)).rejects.toThrow();
  const travel = new pg.Client({ connectionString: databases.travelUrl });
  await travel.connect();
  try {
    await travel.query('SET ROLE tropio_travel_runtime');
    const history = () => travel.query('SELECT version, applied_at FROM travel.local_demo_versions ORDER BY version');
    expect((await history()).rows).toEqual([{ version: 1, applied_at: expect.any(Date) }, { version: 2, applied_at: null }]);
    expect((await travel.query('SELECT id FROM travel.trips WHERE owner_user_id = $1', [organizer.id])).rows)
      .toEqual([{ id: trip.id }]);
    await writeFile(file, content + '\n');
    await expect(applyLocalDemoData(databases, fixtureDirectory)).rejects.toThrow(/История локальных демонстрационных данных/);
    await writeFile(file, content);
    await expect(applyLocalDemoData(databases, fixtureDirectory)).resolves.toBe(true);
    expect((await history()).rows[1]).toEqual({ version: 2, applied_at: expect.any(Date) });
    expect((await travel.query('SELECT id FROM travel.trips WHERE owner_user_id = $1', [organizer.id])).rows)
      .toEqual([{ id: trip.id }]);
    expect(await read<{ id: string }>(`/users/${organizer.id}`)).toMatchObject({ id: organizer.id, display_name: organizer.displayName });
  }
  finally {
    await travel.end();
  }
}, 120_000);
