import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import type { NestNodeApplication } from '@nestjs/platform-node';
import pg from 'pg';
import {
  afterAll,
  beforeAll,
  expect,
} from 'vitest';
import { parse } from 'yaml';
import { createApplication } from '../src/create-application.js';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Actor = { id: string; cookie: string; csrf: string };
type Server = { app: NestNodeApplication; origin: string };
type Position = { lon: number; lat: number };
type Point = { point_id: string; position: Position };
type Track = {
  track_id: string;
  start_point_id: string;
  end_point_id: string;
  geometry: { type: string; coordinates: number[][] };
  status: string;
  transport_mode: string;
  build_mode: string;
  distance_m: number;
  estimated_duration_s?: number;
  elevation_profile?: { source: string; vertical_datum: string; profile: { elevation_m: number | null }[] };
};
type Route = {
  route_id: string;
  route_revision_id: string;
  availability: string;
  points: Point[];
  tracks: Track[];
  trip_type: string | null;
};
type Poi = { poi_id: string; poi_revision_id: string; name: string; media: { media_id: string }[] };
type Trip = { trip_id: string; trip_revision_id: string; days: { day_id: string; route_id: string }[] };
type ContractSchema = {
  allOf?: ContractSchema[];
  oneOf?: ContractSchema[];
  properties?: { code?: { const?: string; enum?: string[] } };
};
type ContractResponse = {
  $ref: string;
  content: Record<string, { schema: ContractSchema }>;
};
type Operation = { tags?: string[]; responses: Record<string, { $ref?: string }> };
type ErrorProbe = { method: Method; path: string; endpoint: string; actor?: Actor; body?: object; badEndpoint?: string; foreignActor?: Actor };
type Contract = {
  paths: Record<string, Partial<Record<Lowercase<Method>, Operation>>>;
  components: { responses: Record<string, ContractResponse> };
};

const browserOrigin = 'http://127.0.0.1:3000';
const password = 'geo-pilot-verification-password';
const uuidFormat = /^[0-9a-f-]{36}$/;
const contract = parse(readFileSync(new URL('../../docs/contracts/openapi.yaml', import.meta.url), 'utf8')) as Contract;
const mail: { email: string; token: string }[] = [];
const servers: Server[] = [];
const seen = new Set<string>();
let identityPool: pg.Pool;
let geoPool: pg.Pool;
let server: Server;
let unavailable: Server;
let owner: Actor;
let visitor: Actor;
let moderator: Actor;
let ownerTrip: Trip;
let visitorTrip: Trip;
let categoryId: string;

const positions = [
  { lon: 84.94, lat: 56.48 },
  { lon: 84.945, lat: 56.48 },
  { lon: 84.95, lat: 56.48 },
  { lon: 84.96, lat: 56.48 },
] as const;

function encodeShape(points: Position[]): string {
  let lastLat = 0;
  let lastLon = 0;
  let result = '';
  for (const point of points) {
    const lat = Math.round(point.lat * 1e6);
    const lon = Math.round(point.lon * 1e6);
    for (const delta of [lat - lastLat, lon - lastLon]) {
      let value = delta < 0 ? -(delta * 2) - 1 : delta * 2;
      while (value >= 32) {
        result += String.fromCharCode((value & 31) + 95);
        value >>= 5;
      }
      result += String.fromCharCode(value + 63);
    }
    lastLat = lat;
    lastLon = lon;
  }
  return result;
}

async function start(databaseUrl: string, identityUrl: string, travelUrl: string, routing: 'mock' | 'down' | 'pilot' = 'mock') {
  const app = await createApplication({ logger: false }, {
    databaseUrl: identityUrl,
    browserOrigin,
    secureCookies: false,
    mailer: { send: async (item) => {
      mail.push(item);
    } },
  }, { databaseUrl: travelUrl, publicationWorker: routing !== 'down' && !travelUrl.includes('127.0.0.1:1/') }, {
    databaseUrl,
    providers: routing === 'pilot'
      ? undefined
      : {
          demManifestPath: '',
          valhallaUrl: 'http://127.0.0.1:1',
          graphVersion: 'http-test-osm',
          coverage: [[84.8, 56.4, 85.2, 56.6]],
          fetcher: async (_input, options) => {
            if (routing === 'down') {
              return new Response('unavailable', { status: 503 });
            }
            const request = JSON.parse(String(options?.body)) as { locations: Position[] };
            if (request.locations.some(position => position.lon > 85.1)) {
              return Response.json({ error_code: 171 }, { status: 400 });
            }
            const snapped = request.locations.map(position => ({
              ...position,
              lat: position.lon === 85 ? position.lat + 0.0001 : position.lat,
            }));
            return Response.json({ trip: {
              status: 0,
              summary: { time: 120.6 },
              legs: [{ shape: encodeShape(snapped) }],
            } });
          },
        },
  }, process.env.TROPIO_SOCIAL_TEST_DATABASE_URL);
  await app.listen(0, '127.0.0.1');
  const result = { app, origin: await app.getUrl() };
  servers.push(result);
  return result;
}

function send(method: Method, path: string, actor?: Actor, body?: object, options: {
  server?: Server; key?: string | false; csrf?: string; origin?: string; cookie?: string;
} = {}): Promise<Response> {
  const headers = new Headers();
  if (actor || options.cookie) {
    headers.set('cookie', options.cookie ?? actor?.cookie ?? '');
  }
  if (method !== 'GET') {
    headers.set('origin', options.origin ?? browserOrigin);
    if (actor) {
      headers.set('x-csrf-token', options.csrf ?? actor.csrf);
    }
    if (options.key !== false) {
      headers.set('idempotency-key', options.key ?? randomUUID());
    }
  }
  if (body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${(options.server ?? server).origin}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json<T>(response: Response, status: number): Promise<T> {
  expect(response.status, `${response.url}: ${response.status !== status ? await response.clone().text() : ''}`).toBe(status);
  expect(response.headers.get('cache-control')).toContain('no-store');
  return response.json() as Promise<T>;
}

function cookie(response: Response, name: string): string {
  const value = response.headers.getSetCookie().find(item => item.startsWith(`${name}=`))?.split(';')[0];
  if (!value) {
    throw new Error(`Expected cookie ${name}`);
  }
  return value;
}

async function actor(): Promise<Actor> {
  const email = `geo-${randomUUID()}@example.test`;
  const registration = await send('POST', '/auth/register', undefined, { email, password, accepted_terms: true });
  expect(registration.status).toBe(202);
  const token = mail.find(item => item.email === email)?.token;
  const registrationCookie = cookie(registration, 'tropio_registration');
  const verified = await send('POST', '/auth/verify-email', undefined, { token }, { cookie: registrationCookie });
  expect(verified.status).toBe(204);
  const loggedIn = await send('POST', '/auth/login', undefined, { email, password });
  const profile = await json<{ id: string; csrf_token: string }>(loggedIn, 200);
  return { id: profile.id, csrf: profile.csrf_token, cookie: cookie(loggedIn, 'tropio_session') };
}

async function trip(actor: Actor): Promise<Trip> {
  const draft = await json<Trip>(await send('POST', '/trips', actor, { title: 'Поездка на Томи' }), 201);
  return json<Trip>(await send('PUT', `/days/${draft.days[0]!.day_id}/route`, actor, {
    trip_revision_id: draft.trip_revision_id,
  }), 200);
}

function codes(schema: ContractSchema): string[] {
  return [
    ...(schema.properties?.code?.const ? [schema.properties.code.const] : []),
    ...(schema.properties?.code?.enum ?? []),
    ...(schema.allOf ?? []).flatMap(codes),
    ...(schema.oneOf ?? []).flatMap(codes),
  ];
}

function declaredErrors(tag = 'Geo'): string[] {
  return Object.entries(contract.paths).flatMap(([path, operations]) =>
    Object.entries(operations).flatMap(([method, operation]) => operation?.tags?.includes(tag)
      ? Object.entries(operation.responses).filter(([status]) => Number(status) >= 400).flatMap(([status, response]) => {
          const schema = contract.components.responses[response.$ref?.split('/').at(-1) ?? '']?.content['application/problem+json']?.schema;
          if (!schema) {
            throw new Error(`Missing error schema for ${method} ${path} ${status}`);
          }
          return codes(schema).map(code => `${method.toUpperCase()} ${path} ${status} ${code}`);
        })
      : []),
  );
}

async function problem(response: Response, method: Method, path: string, status: number, code: string) {
  const schemaRef = contract.paths[path]?.[method.toLowerCase() as Lowercase<Method>]?.responses[status]?.$ref;
  const schema = contract.components.responses[schemaRef?.split('/').at(-1) ?? '']
    ?.content['application/problem+json']?.schema;
  expect(schema && codes(schema), `${method} ${path} ${status}`).toContain(code);
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json(?:;|$)/);
  const actual = await json<{ status: number; code: string; type: string; title: string; request_id: string;
    current_route_revision_id?: string; current_poi_revision_id?: string; current_trip_revision_id?: string; }>(response, status);
  expect(actual).toMatchObject({
    status,
    code,
    type: `urn:tropio:problem:${code.toLowerCase()}`,
    title: expect.any(String),
    request_id: expect.stringMatching(uuidFormat),
  });
  expect(actual.request_id).toBe(response.headers.get('x-request-id'));
  expect(Object.keys(actual).sort()).toEqual(['code', 'request_id', 'status', 'title', 'type',
    ...(actual.current_route_revision_id ? ['current_route_revision_id'] : []),
    ...(actual.current_trip_revision_id ? ['current_trip_revision_id'] : []),
    ...(actual.current_poi_revision_id ? ['current_poi_revision_id'] : []),
  ].sort());
  seen.add(`${method} ${path} ${status} ${code}`);
  return actual;
}

function draftBody(points: Position[], transports: ('car' | 'foot' | 'bicycle')[], revision: string | null = null) {
  return {
    route_revision_id: revision,
    points: points.map(position => ({ position })),
    tracks: transports.map(transport_mode => ({
      transport_mode,
      build_mode: transport_mode === 'foot' ? 'straight' : 'automatic',
    })),
  };
}

function routePath(draft: Trip): string {
  return `/routes/${draft.days[0]!.route_id}`;
}

async function createPoi(actor: Actor, visibility: 'private' | 'global' | 'trip', scopeTrip?: string) {
  return json<Poi>(await send('POST', '/pois', actor, {
    category_id: categoryId,
    name: 'Вид на Томь',
    position: positions[0],
    visibility,
    ...(scopeTrip ? { scope_trip_id: scopeTrip } : {}),
  }), 201);
}

async function approve(poi: Poi) {
  return json<{ poi_revision_id: string }>(await send('POST', `/pois/${poi.poi_id}/moderation`, moderator, {
    decision: 'approved',
    poi_revision_id: poi.poi_revision_id,
  }), 200);
}

beforeAll(async () => {
  const identityUrl = process.env.TROPIO_IDENTITY_TEST_DATABASE_URL;
  const travelUrl = process.env.TROPIO_TRAVEL_TEST_DATABASE_URL;
  const geoUrl = process.env.TROPIO_GEO_TEST_DATABASE_URL;
  if (!identityUrl || !travelUrl || !geoUrl) {
    throw new Error('Use pnpm db:test:geo to provision the three database roles');
  }
  identityPool = new pg.Pool({ connectionString: identityUrl });
  geoPool = new pg.Pool({ connectionString: geoUrl });
  server = await start(geoUrl, identityUrl, travelUrl);
  unavailable = await start('postgresql://127.0.0.1:1/unavailable', identityUrl, travelUrl, 'down');
  owner = await actor();
  visitor = await actor();
  moderator = await actor();
  await identityPool.query('INSERT INTO identity.user_roles (user_id, role_code) VALUES ($1, $2)', [moderator.id, 'poi_moderator']);
  ownerTrip = await trip(owner);
  visitorTrip = await trip(visitor);
  const categories = await json<{ items: { category_id: string }[] }>(await send('GET', '/poi-categories'), 200);
  categoryId = categories.items[0]!.category_id;
}, 30_000);

afterAll(async () => {
  await Promise.all(servers.map(({ app }) => app.close()));
  await Promise.all([identityPool?.end(), geoPool?.end()]);
});

export {
  actor,
  approve,
  browserOrigin,
  categoryId,
  createPoi,
  declaredErrors,
  draftBody,
  geoPool,
  identityPool,
  json,
  moderator,
  owner,
  ownerTrip,
  positions,
  problem,
  routePath,
  seen,
  send,
  server,
  start,
  trip,
  unavailable,
  visitor,
  visitorTrip,
};
export type {
  Actor,
  ErrorProbe,
  Method,
  Poi,
  Position,
  Route,
  Server,
  Track,
  Trip,
};
