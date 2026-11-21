import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import type { NestNodeApplication } from '@nestjs/platform-node';
import pg from 'pg';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { parse } from 'yaml';
import { createApplication } from '../src/create-application.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT';
type Request = {
  method?: Method;
  body?: object;
  rawBody?: string;
  session?: Session;
  origin?: string | false;
  csrf?: string | false;
  key?: string | false;
};
type Session = { cookie: string; csrf: string };
type Mail = { email: string; token: string };
type Server = { app: NestNodeApplication; endpoint: string };
type Day = {
  day_id: string;
  position: number;
  route_id: string | null;
  local_date: string | null;
  description: string | null;
  notes: string | null;
};
type TripSummary = {
  admission_mode: 'open' | 'request';
  trip_id: string;
  trip_revision_id: string;
  publication_id: string | null;
  visibility: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
};
type Draft = TripSummary & {
  description: string | null;
  timezone: string | null;
  free_capacity: number | null;
  difficulty: string | null;
  participation_rules: string | null;
  equipment: { label: string; required: boolean }[];
  days: Day[];
};
type Problem = {
  type: string;
  title: string;
  status: number;
  code: string;
  request_id: string;
  current_trip_revision_id?: string;
};
type Operation = { method: Method; path: string };
type ProblemSchema = {
  $ref?: string;
  allOf?: ProblemSchema[];
  oneOf?: ProblemSchema[];
  anyOf?: ProblemSchema[];
  properties?: { code?: { const?: string; enum?: string[] } };
};
type ContractResponse = {
  $ref?: string;
  content?: Record<string, { schema: ProblemSchema }>;
};
type Contract = {
  paths: Record<string, Partial<Record<Lowercase<Method>, { responses: Record<string, ContractResponse> }>>>;
  components: {
    responses: Record<string, ContractResponse>;
    schemas: Record<string, ProblemSchema>;
  };
};

const origin = 'http://127.0.0.1:3000';
const foreignOrigin = 'https://unrelated.example.test';
const password = 'correct-horse-sees-river';
const problemType = 'application/problem+json';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const contract = parse(readFileSync(new URL('../../docs/contracts/openapi.yaml', import.meta.url), 'utf8')) as Contract;
const listTrips = { method: 'GET', path: '/trips' } as const;
const createTrip = { method: 'POST', path: '/trips' } as const;
const readDraft = { method: 'GET', path: '/trips/{tripId}/draft' } as const;
const patchTrip = { method: 'PATCH', path: '/trips/{tripId}' } as const;
const addDay = { method: 'POST', path: '/trips/{tripId}/days' } as const;
const patchDay = { method: 'PATCH', path: '/days/{dayId}' } as const;
const attachRoute = { method: 'PUT', path: '/days/{dayId}/route' } as const;
const operations = [listTrips, createTrip, readDraft, patchTrip, addDay, patchDay, attachRoute];
const observed = new Set<string>();
const servers: Server[] = [];
const verificationMail: Mail[] = [];
let identityDatabaseUrl: string;
let travelDatabaseUrl: string;
let server: Server;
let owner: Session;
let visitor: Session;

async function start(travelUrl: string, identityUrl = identityDatabaseUrl) {
  const app = await createApplication({ logger: false }, {
    databaseUrl: identityUrl,
    browserOrigin: origin,
    secureCookies: false,
    mailer: { send: async (message) => {
      verificationMail.push(message);
    } },
  }, { databaseUrl: travelUrl });
  try {
    await app.listen(0, '127.0.0.1');
    const running = { app, endpoint: await app.getUrl() };
    servers.push(running);
    return running;
  }
  catch (error) {
    await app.close();
    throw error;
  }
}

beforeAll(async () => {
  const identityUrl = process.env.TROPIO_IDENTITY_TEST_DATABASE_URL;
  const travelUrl = process.env.TROPIO_TRAVEL_TEST_DATABASE_URL;
  if (!identityUrl || !travelUrl) {
    throw new Error('Travel HTTP tests require migrated Identity and Travel runtime URLs for the isolated test database');
  }
  identityDatabaseUrl = identityUrl;
  travelDatabaseUrl = travelUrl;
  server = await start(travelDatabaseUrl);
  const [first, second] = await Promise.all([registerUser(), registerUser()]);
  owner = first;
  visitor = second;
});

afterAll(async () => {
  await Promise.all(servers.map(({ app }) => app.close()));
});

function send(path: string, request: Request = {}, target = server, cookie?: string) {
  const method = request.method ?? 'GET';
  const headers = new Headers();
  const sessionCookie = request.session?.cookie ?? cookie;
  const csrf = request.csrf ?? request.session?.csrf;
  const requestOrigin = request.origin ?? (method === 'GET' ? false : origin);
  if (requestOrigin) {
    headers.set('origin', requestOrigin);
  }
  if (sessionCookie) {
    headers.set('cookie', sessionCookie);
  }
  if (csrf) {
    headers.set('x-csrf-token', csrf);
  }
  if (request.key) {
    headers.set('idempotency-key', request.key);
  }
  const body = request.rawBody ?? (request.body === undefined ? undefined : JSON.stringify(request.body));
  if (body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${target.endpoint}/api/v1${path}`, { method, headers, body });
}

function cookieFor(response: Response, name: string) {
  const value = response.headers.getSetCookie()
    .find(cookie => cookie.startsWith(`${name}=`))?.split(';', 1)[0];
  if (!value) {
    throw new Error(`Missing ${name} cookie in Identity fixture`);
  }
  return value;
}

async function registerUser(): Promise<Session> {
  const email = `travel-qa-${randomUUID()}@example.test`;
  const registration = await send('/auth/register', {
    method: 'POST',
    body: { email, password, accepted_terms: true },
  });
  expect(registration.status).toBe(202);
  const mail = verificationMail.find(message => message.email === email);
  if (!mail) {
    throw new Error('Identity fixture did not send the verification message');
  }
  const confirmation = await send('/auth/verify-email', {
    method: 'POST',
    body: { token: mail.token },
  }, server, cookieFor(registration, 'tropio_registration'));
  expect(confirmation.status).toBe(204);
  const login = await send('/auth/login', { method: 'POST', body: { email, password } });
  expect(login.status).toBe(200);
  const { csrf_token } = await login.json() as { csrf_token: string };
  expect(csrf_token).toEqual(expect.any(String));
  return { cookie: cookieFor(login, 'tropio_session'), csrf: csrf_token };
}

function schemaCodes(schema: ProblemSchema): string[] {
  const { const: code, enum: codes } = schema.properties?.code ?? {};
  const branches = [...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])];
  const referenced = schema.$ref && contract.components.schemas[schema.$ref.slice('#/components/schemas/'.length)];
  return [
    ...(code === undefined ? [] : [code]),
    ...(codes ?? []),
    ...branches.flatMap(schemaCodes),
    ...(referenced ? schemaCodes(referenced) : []),
  ];
}

function declaredPairs(operation: Operation) {
  const method = operation.method.toLowerCase() as Lowercase<Method>;
  const responses = contract.paths[operation.path]?.[method]?.responses;
  const format = `${operation.method} ${operation.path}`;
  expect(responses, format).toBeDefined();
  return Object.entries(responses ?? {}).flatMap(([status, source]) => {
    if (!/^[45][0-9]{2}$/.test(status)) {
      return [];
    }
    const response = source.$ref ? contract.components.responses[source.$ref.slice('#/components/responses/'.length)] : source;
    const schema = response?.content?.[problemType]?.schema;
    expect(schema, `${format} ${status}`).toBeDefined();
    const codes = schemaCodes(schema ?? {});
    expect(codes, `${format} ${status}`).not.toHaveLength(0);
    return codes.map(code => `${status} ${code}`);
  });
}

async function expectProblem(response: Response, operation: Operation, status: number, code: string, revision?: string) {
  expect(response.status, `${operation.method} ${operation.path} ${code}`).toBe(status);
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json(?:;|$)/i);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const requestId = response.headers.get('x-request-id');
  expect(requestId).toMatch(uuid);
  const problem = await response.json() as Problem;
  expect(problem).toEqual({
    type: expect.any(String),
    title: expect.any(String),
    status,
    code,
    request_id: requestId,
    ...(revision ? { current_trip_revision_id: revision } : {}),
  });
  const pair = `${status} ${code}`;
  expect(declaredPairs(operation)).toContain(pair);
  observed.add(`${operation.method} ${operation.path} ${pair}`);
  return problem;
}

function reservedDay(draft: Draft) {
  const day = draft.days[0];
  if (!day) {
    throw new Error('Travel fixture must have a first day');
  }
  return day;
}

function pathFor(operation: Operation, draft: Draft, resourceId?: string) {
  return operation.path
    .replace('{tripId}', resourceId ?? draft.trip_id)
    .replace('{dayId}', resourceId ?? reservedDay(draft).day_id);
}

function mutation(operation: Operation, session: Session, body: object, overrides: Partial<Request> = {}): Request {
  return {
    method: operation.method,
    session,
    key: randomUUID(),
    body,
    ...overrides,
  };
}

function inputFor(operation: Operation, draft: Draft, session: Session): Request {
  const revision = { trip_revision_id: draft.trip_revision_id };
  if (operation.method === 'GET') {
    return { session };
  }
  if (operation === createTrip) {
    return mutation(operation, session, { title: 'Другой черновик' });
  }
  if (operation === patchTrip) {
    return mutation(operation, session, { ...revision, title: 'Другое название' });
  }
  if (operation === addDay || operation === patchDay) {
    return mutation(operation, session, { ...revision, notes: 'Другие заметки' });
  }
  return mutation(operation, session, revision);
}

async function draftResponse(response: Response, status = 200) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const draft = await response.json() as Draft;
  expect(draft.trip_id).toMatch(uuid);
  expect(draft.trip_revision_id).toMatch(uuid);
  for (const day of draft.days) {
    expect(day.day_id).toMatch(uuid);
    if (day.route_id) {
      expect(day.route_id).toMatch(uuid);
    }
  }
  return draft;
}

function create(title: string, properties: object = {}, session = owner) {
  return send('/trips', mutation(createTrip, session, { title, ...properties })).then(response => draftResponse(response, 201));
}

function read(draft: Draft, session = owner) {
  return send(pathFor(readDraft, draft), { session }).then(response => draftResponse(response));
}

function edit(operation: Operation, draft: Draft, properties: object = {}, key?: string, dayId?: string) {
  const input = mutation(operation, owner, { trip_revision_id: draft.trip_revision_id, ...properties });
  if (key) {
    input.key = key;
  }
  return send(pathFor(operation, draft, dayId), input);
}

describe('Travel HTTP contract', () => {
  it('creates a private draft with a first day and lists only the owner trips', async () => {
    const listOwner = await registerUser();
    const draft = await create('Минимальное путешествие', {}, listOwner);
    const sibling = await create('Поездка через Новый год', {
      start_date: '2026-12-31',
      end_date: '2027-01-02',
      admission_mode: 'open',
    }, listOwner);
    await create('Trip of a different account', {}, visitor);

    expect(draft).toMatchObject({
      title: 'Минимальное путешествие',
      publication_id: null,
      visibility: 'private',
      admission_mode: 'request',
      start_date: null,
      end_date: null,
      equipment: [],
      days: [{ position: 1, route_id: null, local_date: null }],
    });
    expect(sibling).toMatchObject({
      admission_mode: 'open',
      start_date: '2026-12-31',
      end_date: '2027-01-02',
      days: [{ position: 1, route_id: null, local_date: '2026-12-31' }],
    });
    expect(await read(draft, listOwner)).toEqual(draft);
    expect(await read(sibling, listOwner)).toEqual(sibling);

    const first = await send('/trips?limit=1', { session: listOwner });
    expect(first.status).toBe(200);
    const firstPage = await first.json() as { items: TripSummary[]; next_cursor: string };
    expect(firstPage.items).toHaveLength(1);
    const [firstId, secondId] = [draft.trip_id, sibling.trip_id].sort();
    expect(firstPage.items[0]).toMatchObject({ trip_id: firstId });
    expect(firstPage.next_cursor).toBe(firstId);

    const second = await send(`/trips?limit=1&cursor=${firstPage.next_cursor}`, { session: listOwner });
    expect(second.status).toBe(200);
    const secondPage = await second.json() as { items: TripSummary[]; next_cursor: string | null };
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]).toMatchObject({ trip_id: secondId });
    expect(secondPage.next_cursor).toBeNull();
  });

  it('persists day changes and binds one server-created empty route to each selected day', async () => {
    const initial = await create('Начальный заголовок', {
      start_date: '2026-12-31',
      end_date: '2027-01-02',
      timezone: 'Asia/Tomsk',
      equipment: [{ label: 'Аптечка', required: true }],
    });
    const renamed = await draftResponse(await edit(patchTrip, initial, {
      title: 'Через Новый год',
      description: 'Два дня по тропе',
      free_capacity: 4,
    }));
    expect(renamed.trip_revision_id).not.toBe(initial.trip_revision_id);
    expect(renamed).toMatchObject({
      title: 'Через Новый год',
      free_capacity: 4,
      timezone: 'Asia/Tomsk',
      equipment: [{ label: 'Аптечка', required: true }],
    });
    const firstDay = reservedDay(renamed);
    const withNotes = await draftResponse(await edit(patchDay, renamed, {
      description: 'Дорога к лагерю',
      notes: 'Сбор у входа',
    }, undefined, firstDay.day_id));
    const withSecondDay = await draftResponse(await edit(addDay, withNotes, {
      local_date: '2027-01-01',
      description: 'Выход на тропу',
      notes: 'Взять воду',
    }), 201);
    expect(withSecondDay.days).toEqual([
      { ...firstDay, description: 'Дорога к лагерю', notes: 'Сбор у входа' },
      {
        day_id: expect.stringMatching(uuid),
        position: 2,
        route_id: null,
        local_date: '2027-01-01',
        description: 'Выход на тропу',
        notes: 'Взять воду',
      },
    ]);

    const secondDay = withSecondDay.days[1]!;
    const withSecondRoute = await draftResponse(await edit(attachRoute, withSecondDay, {}, undefined, secondDay.day_id));
    const secondRouteId = withSecondRoute.days[1]?.route_id;
    expect(secondRouteId).toMatch(uuid);
    expect(withSecondRoute.days[0]?.route_id).toBeNull();
    expect(withSecondRoute.trip_revision_id).not.toBe(withSecondDay.trip_revision_id);
    const repeated = await draftResponse(await edit(attachRoute, withSecondRoute, {}, undefined, secondDay.day_id));
    expect(repeated).toEqual(withSecondRoute);

    const withBothRoutes = await draftResponse(await edit(attachRoute, repeated, {}, undefined, firstDay.day_id));
    const firstRouteId = withBothRoutes.days[0]?.route_id;
    expect(firstRouteId).toMatch(uuid);
    expect(firstRouteId).not.toBe(secondRouteId);
    expect(withBothRoutes.days[1]?.route_id).toBe(secondRouteId);
    expect(await read(withBothRoutes)).toEqual(withBothRoutes);

    const database = new pg.Client({ connectionString: travelDatabaseUrl });
    await database.connect();
    try {
      const result = await database.query(
        'SELECT id, trip_day_id, geometry_status FROM travel.routes WHERE trip_id = $1 ORDER BY trip_day_id',
        [initial.trip_id],
      );
      expect(result.rows).toHaveLength(2);
      expect(result.rows).toEqual(expect.arrayContaining([
        { id: firstRouteId, trip_day_id: firstDay.day_id, geometry_status: 'empty' },
        { id: secondRouteId, trip_day_id: secondDay.day_id, geometry_status: 'empty' },
      ]));
      const isolation = await database.query('SELECT has_schema_privilege(current_user, \'geo\', \'USAGE\') AS geo_usage');
      expect(isolation.rows).toEqual([{ geo_usage: false }]);
    }
    finally {
      await database.end();
    }
  });

  it('hides foreign trip and day resources as missing before reporting revision conflicts', async () => {
    const ownDraft = await create('Private owner draft');
    const foreignId = randomUUID();

    for (const operation of [readDraft, patchTrip, addDay, patchDay, attachRoute]) {
      const input = inputFor(operation, ownDraft, visitor);
      if (operation.method !== 'GET') {
        input.body = { ...input.body, trip_revision_id: randomUUID() };
      }
      const foreign = await expectProblem(await send(pathFor(operation, ownDraft), input), operation, 404, 'NOT_FOUND');
      const absent = await expectProblem(await send(pathFor(operation, ownDraft, foreignId), input), operation, 404, 'NOT_FOUND');
      expect({ ...foreign, request_id: absent.request_id }).toEqual(absent);
    }

    const route = pathFor(attachRoute, ownDraft);
    const crafted = await send(route, mutation(attachRoute, owner, {
      trip_revision_id: ownDraft.trip_revision_id,
      route_id: randomUUID(),
    }));
    await expectProblem(crafted, attachRoute, 400, 'INVALID_REQUEST');
    expect(await read(ownDraft)).toEqual(ownDraft);
  });

  it('replays a scoped creation once, including simultaneous requests, and rejects a changed payload', async () => {
    const key = randomUUID();
    const input = mutation(createTrip, owner, { title: 'Travel за один запрос' }, { key });
    const [first, second] = await Promise.all([
      send(createTrip.path, input).then(response => draftResponse(response, 201)),
      send(createTrip.path, input).then(response => draftResponse(response, 201)),
    ]);
    expect(second).toEqual(first);
    const changed = { ...input, body: { title: 'Этот ключ уже занят' } };
    await expectProblem(await send(createTrip.path, changed), createTrip, 409, 'IDEMPOTENCY_KEY_REUSED');
    const byAnotherAccount = await draftResponse(await send(createTrip.path, { ...input, session: visitor }), 201);
    expect(byAnotherAccount.trip_id).not.toBe(first.trip_id);

    const updated = await draftResponse(await edit(patchTrip, first, { title: 'Название после правки' }));
    const normalized = { ...input, body: { title: '  Travel за один запрос  ' } };
    expect(await draftResponse(await send(createTrip.path, normalized), 201)).toEqual(first);
    expect(await read(updated)).toEqual(updated);
  });

  it('checks idempotency before revision equality for every draft mutation', async () => {
    let current = await create('Travel replay draft');
    for (const operation of [patchTrip, addDay, patchDay, attachRoute]) {
      const path = pathFor(operation, current);
      const original = inputFor(operation, current, owner);
      const status = operation === addDay ? 201 : 200;
      const changed = await draftResponse(await send(path, original), status);
      const replay = await draftResponse(await send(path, original), status);
      expect(replay).toEqual(changed);
      expect(changed.trip_revision_id).not.toBe(current.trip_revision_id);

      const changedKey = { ...original, key: randomUUID() };
      await expectProblem(await send(path, changedKey), operation, 409, 'TRIP_REVISION_CONFLICT', changed.trip_revision_id);
      const changedBody = { ...original, body: { ...original.body, trip_revision_id: randomUUID() } };
      await expectProblem(await send(path, changedBody), operation, 409, 'IDEMPOTENCY_KEY_REUSED');
      const foreignReplay = { ...original, session: visitor };
      await expectProblem(await send(path, foreignReplay), operation, 404, 'NOT_FOUND');
      current = changed;
    }
  });

  it('commits only one concurrent route binding and exposes the winning revision to the owner', async () => {
    const draft = await create('Travel concurrent route draft');
    const path = pathFor(attachRoute, draft);
    const results = await Promise.all([
      send(path, inputFor(attachRoute, draft, owner)),
      send(path, inputFor(attachRoute, draft, owner)),
    ]);
    expect(results.map(response => response.status).sort()).toEqual([200, 409]);
    const committed = await draftResponse(results.find(response => response.status === 200)!);
    await expectProblem(results.find(response => response.status === 409)!, attachRoute, 409,
      'TRIP_REVISION_CONFLICT', committed.trip_revision_id);
    expect(reservedDay(committed).route_id).toMatch(uuid);
    expect(await read(committed)).toEqual(committed);
  });

  it('validates dates as calendar strings and keeps the draft unchanged after a conflicting range', async () => {
    const invalidDate = mutation(createTrip, owner, { title: 'Неверный день', start_date: '2027-02-29' });
    await expectProblem(await send(createTrip.path, invalidDate), createTrip, 400, 'INVALID_REQUEST');
    const invertedRange = mutation(createTrip, owner, {
      title: 'Неверный диапазон',
      start_date: '2027-01-02',
      end_date: '2027-01-01',
    });
    await expectProblem(await send(createTrip.path, invertedRange), createTrip, 422, 'INVALID_TRIP_DATES');

    const draft = await create('Эта поездка на два дня', { start_date: '2027-01-01', end_date: '2027-01-02' });
    await expectProblem(await edit(patchTrip, draft, { start_date: '2027-01-02' }), patchTrip, 422, 'INVALID_TRIP_DATES');
    await expectProblem(await edit(addDay, draft, { local_date: '2027-01-03' }), addDay, 422, 'INVALID_TRIP_DATES');
    await expectProblem(await edit(patchDay, draft, { local_date: '2026-12-31' }), patchDay, 422, 'INVALID_TRIP_DATES');
    expect(await read(draft)).toEqual(draft);
  });

  it('moves dated days atomically on request and replays the result with the original key', async () => {
    const original = await create('Программа високосного года', { start_date: '2028-02-28', end_date: '2028-03-01' });
    const withLeapDay = await draftResponse(await edit(addDay, original, { local_date: '2028-02-29' }), 201);
    const draft = await draftResponse(await edit(addDay, withLeapDay), 201);
    const shortened = { shift_day_dates: true, start_date: '9999-12-31', end_date: null };
    await expectProblem(await edit(patchTrip, draft, shortened), patchTrip, 422, 'INVALID_TRIP_DATES');
    expect(await read(draft)).toEqual(draft);

    const period = { start_date: '0001-01-01', end_date: '0001-01-02', shift_day_dates: true };
    const key = randomUUID();
    const moved = await draftResponse(await edit(patchTrip, draft, period, key));
    expect(moved.days).toEqual(draft.days.map((day, i) => ({ ...day, local_date: ['0001-01-01', '0001-01-02', null][i] })));
    expect(moved.trip_revision_id).not.toBe(draft.trip_revision_id);
    expect(await draftResponse(await edit(patchTrip, draft, period, key))).toEqual(moved);
    expect(await read(moved)).toEqual(moved);
    await expectProblem(await edit(patchTrip, draft, { ...period, shift_day_dates: false }, key), patchTrip, 409, 'IDEMPOTENCY_KEY_REUSED');
  });

  it('requires a changed start date and an existing period for shifting day dates', async () => {
    const draft = await create('Без дат');
    for (const settings of [{ shift_day_dates: true }, { start_date: null, shift_day_dates: true }, { title: 'Поездка', shift_day_dates: 'true' }]) {
      await expectProblem(await edit(patchTrip, draft, settings), patchTrip, 400, 'INVALID_REQUEST');
    }
    await expectProblem(await edit(patchTrip, draft, { start_date: '2027-01-01', shift_day_dates: true }), patchTrip, 422, 'INVALID_TRIP_DATES');
    const scheduled = await draftResponse(await edit(patchTrip, draft, { start_date: '2027-01-01' }));
    await expectProblem(await edit(patchTrip, scheduled, { start_date: scheduled.start_date, shift_day_dates: true }), patchTrip, 422, 'INVALID_TRIP_DATES');
    expect(await read(scheduled)).toEqual(scheduled);
  });

  it('keeps an existing out-of-range day date during unrelated edits', async () => {
    const original = await create('Поездка из предыдущей версии', {
      start_date: '2027-01-01',
      end_date: '2027-01-02',
    });
    const legacyDate = '2026-12-31';
    const dayId = reservedDay(original).day_id;
    const database = new pg.Client({ connectionString: travelDatabaseUrl });
    await database.connect();
    try {
      const { rowCount } = await database.query(
        'UPDATE travel.trip_days SET local_date = $1 WHERE trip_id = $2 AND id = $3',
        [legacyDate, original.trip_id, dayId],
      );
      expect(rowCount).toBe(1);
    }
    finally {
      await database.end();
    }

    const renamed = await draftResponse(await edit(patchTrip, original, { title: 'Новое название' }));
    expect(renamed.title).toBe('Новое название');
    expect(reservedDay(renamed).local_date).toBe(legacyDate);
    const annotated = await draftResponse(await edit(patchDay, renamed, { notes: 'Новые заметки' }));
    expect(reservedDay(annotated)).toMatchObject({ day_id: dayId, local_date: legacyDate, notes: 'Новые заметки' });
    expect(await read(annotated)).toEqual(annotated);
  });

  it('accepts valid multibyte draft text beyond the Identity parser limit', async () => {
    const metadata = {
      description: 'Д'.repeat(4000),
      participation_rules: 'П'.repeat(3000),
    };
    expect(Buffer.byteLength(JSON.stringify(metadata))).toBeGreaterThan(8192);
    const created = await create('Длинное описание', metadata);
    expect(created).toMatchObject(metadata);
    expect(await read(created)).toEqual(created);
  });

  it('checks request schema, session and CSRF per operation declared in OpenAPI', async () => {
    const fixture = await create('Travel validation draft');
    for (const operation of operations) {
      const path = pathFor(operation, fixture);
      const input = inputFor(operation, fixture, owner);
      const invalidPath = operation === listTrips
        ? '/trips?limit=0'
        : operation === readDraft ? pathFor(operation, fixture, 'invalid-id') : path;
      const invalidInput = operation.method === 'GET' ? input : { ...input, body: { unexpected: true } };

      await expectProblem(await send(invalidPath, invalidInput), operation, 400, 'INVALID_REQUEST');
      await expectProblem(await send(path, { ...input, session: undefined, csrf: false }), operation, 401, 'SESSION_REQUIRED');
      if (operation.method !== 'GET') {
        await expectProblem(await send(path, { ...input, origin: foreignOrigin }), operation, 403, 'CSRF_REJECTED');
        await expectProblem(await send(path, { ...input, csrf: false }), operation, 403, 'CSRF_REJECTED');
        await expectProblem(await send(path, { ...input, key: false }), operation, 400, 'INVALID_REQUEST');
      }
    }

    const invalidJson = mutation(createTrip, owner, {}, { rawBody: '{"title":' });
    await expectProblem(await send(createTrip.path, invalidJson), createTrip, 400, 'INVALID_REQUEST');
    expect(await read(fixture)).toEqual(fixture);
  });

  it('maps real Travel and Identity database failures to the declared BFF dependency error', async () => {
    const fixture = await create('Travel dependency draft');
    const unavailableDatabase = new URL(travelDatabaseUrl);
    unavailableDatabase.pathname = `/missing_${randomUUID().replaceAll('-', '')}`;
    const unavailableTravel = await start(unavailableDatabase.href);
    for (const operation of operations) {
      const response = await send(pathFor(operation, fixture), inputFor(operation, fixture, owner), unavailableTravel);
      await expectProblem(response, operation, 503, 'DEPENDENCY_UNAVAILABLE');
    }
    const unavailableIdentityDb = new URL(identityDatabaseUrl);
    unavailableIdentityDb.pathname = unavailableDatabase.pathname;
    const unavailableIdentity = await start(travelDatabaseUrl, unavailableIdentityDb.href);
    await expectProblem(await send(listTrips.path, { session: owner }, unavailableIdentity),
      listTrips, 503, 'DEPENDENCY_UNAVAILABLE');
  });

  it('observes every declared status and machine-code pair on the implemented Travel operations', () => {
    const expected = operations.flatMap(operation => declaredPairs(operation)
      .map(pair => `${operation.method} ${operation.path} ${pair}`));
    expect([...observed].sort()).toEqual([...new Set(expected)].sort());
  });
});
