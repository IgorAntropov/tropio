import { randomUUID } from 'node:crypto';
import process from 'node:process';
import type { NestNodeApplication } from '@nestjs/platform-node';
import pg from 'pg';
import {
  afterAll,
  beforeAll,
  expect,
  it,
} from 'vitest';
import { ensureLocalDemoAccount } from '../local/demo-account.mts';
import { createApplication } from '../src/create-application.js';

const origin = 'http://127.0.0.1:3000';
const password = 'equipment-library-test-password';
const identityUrl = process.env.TROPIO_IDENTITY_TEST_DATABASE_URL!;
const travelUrl = process.env.TROPIO_TRAVEL_TEST_DATABASE_URL!;
let app: NestNodeApplication;
let endpoint: string;
let owner: Session;
let visitor: Session;

interface Session { cookie: string; csrf: string }
interface Group { id: string; label: string }
interface Item { id: string; label: string; category: string; scope: string; code?: string; group?: Group; subgroup?: Group; icon?: string }
interface Library { items: Item[]; categories: { id: string; label: string; group: string }[] }

async function login() {
  const id = randomUUID();
  const email = `equipment-${id}@example.test`;
  expect(await ensureLocalDemoAccount(identityUrl, {
    id,
    email,
    password,
    displayName: 'Организатор',
  })).toBe(true);
  const response = await fetch(endpoint + '/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  return {
    cookie: response.headers.getSetCookie()[0]!.split(';')[0]!,
    csrf: (await response.json() as { csrf_token: string }).csrf_token,
  };
}

beforeAll(async () => {
  app = await createApplication({ logger: false }, {
    databaseUrl: identityUrl,
    browserOrigin: origin,
    secureCookies: false,
  }, { databaseUrl: travelUrl, publicationWorker: false });
  await app.listen(0, '127.0.0.1');
  endpoint = await app.getUrl() + '/api/v1';
  [owner, visitor] = await Promise.all([login(), login()]);
});
afterAll(async () => app?.close());

async function list(session: Session): Promise<Library> {
  const response = await fetch(endpoint + '/me/equipment', { headers: { cookie: session.cookie } });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response.json() as Promise<Library>;
}

function create(body: string | Record<string, unknown>, session = owner, key: string = randomUUID(), extra: Record<string, string> = {}) {
  return fetch(endpoint + '/me/equipment', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'cookie': session.cookie,
      'x-csrf-token': session.csrf,
      'idempotency-key': key,
      ...extra,
    },
    body: JSON.stringify(typeof body === 'string' ? { label: body } : body),
  });
}

it('lists all seventeen ordered categories and all 153 system suggestions with their original metadata', async () => {
  const { items, categories } = await list(owner);
  expect(categories).toHaveLength(17);
  expect(categories[0]).toEqual({ id: 'documents', label: 'Документы и деньги', group: 'Общие' });
  expect(categories.at(-1)).toEqual({ id: 'family', label: 'С детьми и животными', group: 'Специальные' });
  expect(items).toHaveLength(153);
  expect(items.every(item => item.scope === 'system')).toBe(true);
  expect(new Set(items.map(item => item.id)).size).toBe(153);
  expect(new Set(items.map(item => item.code)).size).toBe(153);
  expect(items[0]).toMatchObject({
    code: 'passport',
    label: 'Паспорт или удостоверение личности',
    condition: 'Требуется в зависимости от страны и способа поездки',
    carry_scope: 'personal',
    travel_types: ['all'],
    unit: 'pcs',
    is_active: true,
  });
  const lamps = items.filter(item => item.label === 'Налобный фонарь');
  expect(lamps.map(item => item.code)).toEqual(['headlamp', 'personal_headlamp']);
  expect(lamps.map(item => item.category)).toEqual(['camp', 'hiking']);
  const response = await create(' НАЛОБНЫЙ ФОНАРЬ ');
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual(lamps[0]);
});

it('keeps personal additions isolated, deduplicates concurrent commands and binds a key to its original request', async () => {
  const label = 'Кружка из титана';
  const key = randomUUID();
  const responses = await Promise.all([create(label, owner, key), create(label, owner, key), create(label.toUpperCase())]);
  for (const response of responses) {
    expect(response.status).toBe(201);
  }
  const results = await Promise.all(responses.map(response => response.json() as Promise<Item>));
  const item = results[0]!;
  expect(results.every(result => result.id === item.id)).toBe(true);
  expect(item).toMatchObject({ scope: 'personal', category: 'other' });
  expect(item.label.toLowerCase()).toBe(label.toLowerCase());
  expect((await list(visitor)).items.some(entry => entry.id === item.id)).toBe(false);
  expect((await list(owner)).items.filter(entry => entry.scope === 'personal')).toEqual([item]);
  const own = await create(label, visitor, key);
  expect(own.status).toBe(201);
  expect((await own.json() as Item).id).not.toBe(item.id);
  const conflict = await create('Другой предмет', owner, key);
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
});

it('checks authentication, origin, CSRF, command key and validated label before writing', async () => {
  expect((await fetch(endpoint + '/me/equipment')).status).toBe(401);
  expect((await create('Горелка', { cookie: '', csrf: '' })).status).toBe(401);
  expect((await create('Горелка', owner, randomUUID(), { origin: 'https://other.test' })).status).toBe(403);
  expect((await create('Горелка', { ...owner, csrf: 'invalid' })).status).toBe(403);
  expect((await create('Горелка', owner, 'invalid')).status).toBe(400);
  for (const invalid of [' ', 'Я'.repeat(121), 'а\0б']) {
    expect((await create(invalid)).status).toBe(400);
  }
});

it('shares groups across concurrent personal items and supports every combination of location and icon', async () => {
  const group = { label: 'Походная кухня' };
  const subgroup = { label: 'Посуда' };
  const bodies = [
    { label: 'Запасная деталь' },
    { label: 'Своя салфетка', icon: 'hygiene' },
    { label: 'Пакет крупы', group },
    { label: 'Щепотка перца', group, icon: 'food' },
    { label: 'Миска из титана', group, subgroup },
    {
      label: 'Кружка с карабином',
      group,
      subgroup,
      icon: 'cooking',
    },
  ];
  const items = await Promise.all(bodies.map(async (body) => {
    const response = await create(body);
    expect(response.status).toBe(201);
    return response.json() as Promise<Item>;
  }));
  expect(new Set(items.flatMap(item => item.group ? [item.group.id] : [])).size).toBe(1);
  expect(new Set(items.flatMap(item => item.subgroup ? [item.subgroup.id] : [])).size).toBe(1);
  const listed = (await list(owner)).items;
  for (const [index, item] of items.entries()) {
    const body = bodies[index]!;
    expect(item.group?.label).toBe(body.group?.label);
    expect(item.subgroup?.label).toBe(body.subgroup?.label);
    expect(item.icon).toBe(body.icon);
    expect(listed.find(row => row.id === item.id)).toEqual(item);
  }
  const cup = items[5]!;
  const personal = {
    label: 'Налобный фонарь',
    group: { id: cup.group!.id },
    subgroup: { id: cup.subgroup!.id },
    icon: 'electronics',
  };
  const key = randomUUID();
  const response = await create(personal, owner, key);
  expect(response.status).toBe(201);
  const lamp = await response.json() as Item;
  expect(lamp).toMatchObject({
    scope: 'personal',
    group: cup.group,
    subgroup: cup.subgroup,
    icon: 'electronics',
  });
  expect(await (await create(personal, owner, key)).json()).toEqual(lamp);
  expect(await (await create({ ...personal, icon: 'city' }, owner, key)).json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  expect(await (await create({ ...personal, icon: 'city' })).json()).toMatchObject({ code: 'EQUIPMENT_DETAILS_CONFLICT' });
  expect(await (await create({ ...personal, group: { label: group.label.toUpperCase() }, subgroup })).json()).toEqual(lamp);
  expect((await list(owner)).items.filter(row => row.label === lamp.label)).toHaveLength(3);
});

it('checks the owner and exact parent of a group and rolls back unmatched paths', async () => {
  const body = { label: 'Крюк для тента', group: { label: 'Снаряжение для ночёвки' }, subgroup: { label: 'Крепления' } };
  const response = await create(body);
  expect(response.status).toBe(201);
  const first = await response.json() as Item;
  const secondResponse = await create({ ...body, label: 'Зажим', group: { label: 'Инструменты на маршруте' } });
  const second = await secondResponse.json() as Item;
  expect(second.subgroup!.id).not.toBe(first.subgroup!.id);
  for (const failed of [
    await create({ label: 'Личная вещь', group: { id: first.group!.id } }, visitor),
    await create({ label: 'Личная вещь', group: { label: 'Группа посетителя' }, subgroup: { id: first.subgroup!.id } }, visitor),
    await create({ label: 'Личная вещь', group: { id: first.group!.id }, subgroup: { id: second.subgroup!.id } }),
  ]) {
    expect(failed.status).toBe(404);
    expect(await failed.json()).toMatchObject({ code: 'NOT_FOUND' });
  }
  const client = new pg.Client({ connectionString: travelUrl });
  try {
    await client.connect();
    const { rowCount } = await client.query('SELECT id FROM travel.personal_equipment_groups WHERE label = $1', ['Группа посетителя']);
    expect(rowCount).toBe(0);
  }
  finally {
    await client.end();
  }
});

it('creates an ungrouped personal item even when the system already suggests its name', async () => {
  const label = 'Палатка';
  const key = randomUUID();
  const system = await (await create(label)).json() as Item;
  expect(system.scope).toBe('system');
  const body = { label, scope: 'personal' };
  const response = await create(body, owner, key);
  expect(response.status).toBe(201);
  const item = await response.json() as Item;
  expect(item).toEqual({
    label,
    scope: 'personal',
    category: 'other',
    id: expect.any(String),
  });
  expect(item.id).not.toBe(system.id);
  expect(await (await create(body, owner, key)).json()).toEqual(item);
  expect((await create(label, owner, key)).status).toBe(409);
  const names = (await list(visitor)).items.filter(entry => entry.label === label);
  expect(names).toEqual([system]);
});

it('rejects malformed folder references, missing parents and unknown icons', async () => {
  for (const invalid of [
    { scope: 'system' }, { subgroup: { label: 'Подгруппа' } }, { icon: 'unknown' }, { icon: null }, { group: null }, { group: {} },
    { group: { id: randomUUID(), label: 'Группа' } }, { group: { id: 'other' } }, { group: { label: ' ' } },
    { group: { label: 'а'.repeat(121) } }, { group: { name: 'Группа' } },
  ]) {
    expect((await create({ label: 'Проверка данных', ...invalid })).status).toBe(400);
  }
});

it('keeps system suggestions and their dictionaries read-only for the travel runtime', async () => {
  const client = new pg.Client({ connectionString: travelUrl });
  try {
    await client.connect();
    await client.query('SET ROLE tropio_travel_runtime');
    for (const table of ['equipment_catalog', 'equipment_categories', 'equipment_travel_types', 'equipment_dictionary']) {
      const { rows } = await client.query<{ writable: boolean }>(
        'SELECT has_table_privilege(current_user, $1, \'INSERT, UPDATE, DELETE\') AS writable',
        ['travel.' + table],
      );
      expect(rows[0]?.writable).toBe(false);
    }
  }
  finally {
    await client.end();
  }
});
