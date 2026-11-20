import {
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import type { NestNodeApplication } from '@nestjs/platform-node';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { parse } from 'yaml';
import demoAccount from '../../fixtures/demo-account.json' with { type: 'json' };
import { ensureLocalDemoAccount } from '../local/demo-account.mjs';
import { createApplication } from '../src/create-application.js';
import { ServiceDatabase } from '../src/database/service-database.js';

type Method = 'GET' | 'POST' | 'PATCH';
type RequestData = {
  method?: Method;
  body?: object;
  rawBody?: string;
  origin?: string | null;
  cookie?: string;
  csrf?: string;
  proxySecret?: string;
  sourceIp?: string;
};
type Avatar = { id: string; url: string };
type Profile = { id: string; display_name: string; bio: string | null; avatar: Avatar | null };
type Me = Profile & { csrf_token: string };
type Mail = { kind: 'verify-email' | 'reset-password'; email: string; token: string };
type Server = { app: NestNodeApplication; endpoint: string };
type Operation = { path: string; method: Method };
type ErrorResponse = {
  $ref?: string;
  content?: Record<string, { schema: ProblemSchema }>;
};
type ProblemSchema = {
  $ref?: string;
  allOf?: ProblemSchema[];
  oneOf?: ProblemSchema[];
  anyOf?: ProblemSchema[];
  properties?: { code?: { const?: string; enum?: string[] } };
};
type Contract = {
  paths: Record<string, Partial<Record<Lowercase<Method>, { responses: Record<string, ErrorResponse> }>>>;
  components: { responses: Record<string, ErrorResponse>; schemas: Record<string, ProblemSchema> };
};

const origin = 'http://127.0.0.1:3000';
const foreignOrigin = 'https://unrelated.example.test';
const password = 'correct-horse-sees-forest';
const newPassword = 'correct-horse-sees-stream';
const problemType = 'application/problem+json';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const contract = parse(readFileSync(new URL('../../docs/contracts/openapi.yaml', import.meta.url), 'utf8')) as Contract;
const publicProfilePath = Object.keys(contract.paths).find(path => path.startsWith('/users/{')) ?? '/users/{userId}';
const operations: Operation[] = [
  ...['register', 'resend-verification', 'verify-email', 'login', 'refresh', 'logout',
    'request-password-reset', 'reset-password'].map(name => ({
    path: `/auth/${name}`,
    method: 'POST' as const,
  })),
  { path: '/me', method: 'GET' },
  { path: '/me', method: 'PATCH' },
  { path: '/me/avatar', method: 'PATCH' },
  { path: '/avatar-assets', method: 'GET' },
  { path: publicProfilePath, method: 'GET' },
];
const verifiedPairs = new Set<string>();
const mail: Mail[] = [];
const servers: Server[] = [];
let server: Server;
let databaseUrl: string;

async function start(database: string, rateLimit?: { source: number; email: number }, proxySecret?: string) {
  const app = await createApplication({ logger: false }, {
    databaseUrl: database,
    browserOrigin: origin,
    secureCookies: false,
    proxySecret,
    rateLimit,
    mailer: { send: async (message: Mail) => {
      mail.push(message);
    } },
  });
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
  const supplied = process.env.TROPIO_IDENTITY_TEST_DATABASE_URL;
  if (!supplied) {
    throw new Error('TROPIO_IDENTITY_TEST_DATABASE_URL must point to a migrated, isolated Identity database');
  }
  databaseUrl = supplied;
  server = await start(databaseUrl);
});

afterAll(async () => {
  await Promise.all(servers.map(({ app }) => app.close()));
});

function send(path: string, data: RequestData = {}, target = server) {
  const method = data.method ?? 'GET';
  const headers = new Headers();
  const requestOrigin = data.origin === undefined && method !== 'GET' ? origin : data.origin;
  if (requestOrigin) {
    headers.set('origin', requestOrigin);
  }
  if (data.cookie) {
    headers.set('cookie', data.cookie);
  }
  if (data.csrf) {
    headers.set('x-csrf-token', data.csrf);
  }
  if (data.proxySecret) {
    headers.set('x-tropio-proxy-secret', data.proxySecret);
  }
  if (data.sourceIp) {
    headers.set('x-tropio-client-ip', data.sourceIp);
  }
  const body = data.rawBody ?? (data.body ? JSON.stringify(data.body) : undefined);
  if (body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${target.endpoint}/api/v1${path}`, {
    method,
    headers,
    body,
  });
}

function resolveResponse(response: ErrorResponse) {
  return response.$ref
    ? contract.components.responses[response.$ref.slice('#/components/responses/'.length)]
    : response;
}

function schemaCodes(schema: ProblemSchema): string[] {
  const { const: code, enum: codes } = schema.properties?.code ?? {};
  const branches = [...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])];
  const referenced = schema.$ref && contract.components.schemas[schema.$ref.slice('#/components/schemas/'.length)];
  return [
    ...(code ? [code] : []),
    ...(codes ?? []),
    ...branches.flatMap(schemaCodes),
    ...(referenced ? schemaCodes(referenced) : []),
  ];
}

function declaredPairs(operation: Operation) {
  const method = operation.method.toLowerCase() as Lowercase<Method>;
  const responses = contract.paths[operation.path]?.[method]?.responses;
  expect(responses, `${operation.method} ${operation.path} must exist in OpenAPI`).toBeDefined();
  return Object.entries(responses ?? {}).flatMap(([status, source]) => {
    if (!/^[45][0-9]{2}$/.test(status)) {
      return [];
    }
    const schema = resolveResponse(source)?.content?.[problemType]?.schema;
    expect(schema, `${operation.method} ${operation.path} ${status} must declare ${problemType}`).toBeDefined();
    const codes = schemaCodes(schema ?? {});
    expect(codes, `${operation.method} ${operation.path} ${status} must declare a machine code`).not.toHaveLength(0);
    return codes.map(code => `${status} ${code}`);
  });
}

async function expectProblem(response: Response, operation: Operation, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json(?:;|$)/i);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const requestId = response.headers.get('x-request-id');
  expect(requestId).toMatch(uuid);
  expect(await response.json()).toMatchObject({
    type: expect.any(String),
    title: expect.any(String),
    status,
    code,
    request_id: requestId,
  });
  const pair = `${status} ${code}`;
  expect(declaredPairs(operation)).toContain(pair);
  verifiedPairs.add(`${operation.method} ${operation.path} ${pair}`);
}

function problem(path: string, data: RequestData, status: number, code: string, target = server) {
  const declaredPath = path.startsWith('/users/') ? publicProfilePath : path;
  return send(path, data, target).then(response => expectProblem(response, {
    path: declaredPath,
    method: data.method ?? 'GET',
  }, status, code));
}

function testEmail() {
  return `traveler-${randomUUID()}@example.test`;
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

function readToken(email: string, kind: Mail['kind']) {
  const next = mail.findLast(message => message.email === email && message.kind === kind);
  expect(next, `Expected a ${kind} message`).toBeDefined();
  return next!.token;
}

function readCookie(response: Response, name: 'tropio_registration' | 'tropio_session') {
  const raw = response.headers.getSetCookie().find(cookie => cookie.startsWith(`${name}=`));
  expect(raw, `Expected ${name} cookie`).toBeDefined();
  expect(raw).toMatch(/(?:^|;\s*)HttpOnly(?:;|$)/i);
  expect(raw).toMatch(/(?:^|;\s*)SameSite=(?:Lax|Strict)(?:;|$)/i);
  expect(raw).not.toMatch(/(?:^|;\s*)Domain=/i);
  const pair = raw!.split(';', 1)[0]!;
  expect(pair.length).toBeGreaterThan(name.length + 20);
  return pair;
}

async function register(email = testEmail()) {
  const response = await send('/auth/register', { method: 'POST', body: { email, password, accepted_terms: true } });
  expect(response.status).toBe(202);
  expect(await response.text()).toBe('');
  return { email, registration: readCookie(response, 'tropio_registration'), token: readToken(email, 'verify-email') };
}

async function verify(account: Awaited<ReturnType<typeof register>>) {
  const response = await send('/auth/verify-email', {
    method: 'POST',
    body: { token: account.token },
    cookie: account.registration,
  });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
}

async function login(email: string, suppliedPassword = password) {
  const response = await send('/auth/login', { method: 'POST', body: { email, password: suppliedPassword } });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  return { cookie: readCookie(response, 'tropio_session'), profile: await response.json() as Me };
}

async function accountSession() {
  const account = await register();
  await verify(account);
  return { ...account, ...await login(account.email) };
}

async function activeAvatars() {
  const response = await send('/avatar-assets');
  expect(response.status).toBe(200);
  const result = await response.json() as { items: Avatar[] };
  expect(result.items.length).toBeGreaterThan(1);
  expect(new Set(result.items.map(avatar => avatar.id)).size).toBe(result.items.length);
  for (const avatar of result.items) {
    expect(avatar.id).toMatch(uuid);
    expect(avatar.url).toMatch(/^\/avatars\/[^/]+\.png$/);
  }
  return result.items;
}

function requestFor(operation: Operation, session: Awaited<ReturnType<typeof accountSession>>): RequestData {
  const cookie = session.cookie;
  const csrf = session.profile.csrf_token;
  const body: Record<string, object> = {
    '/auth/register': { email: testEmail(), password, accepted_terms: true },
    '/auth/resend-verification': { email: session.email },
    '/auth/verify-email': { token: session.token },
    '/auth/login': { email: session.email, password },
    '/auth/request-password-reset': { email: session.email },
    '/auth/reset-password': { token: newToken(), password: newPassword },
    '/me': { display_name: 'Лесной исследователь', bio: 'Люблю тропы' },
    '/me/avatar': { avatar_id: session.profile.avatar?.id ?? randomUUID() },
  };
  return {
    method: operation.method,
    ...(operation.method === 'GET' ? {} : { body: body[operation.path] }),
    cookie: ['/auth/resend-verification', '/auth/verify-email'].includes(operation.path)
      ? session.registration
      : cookie,
    csrf,
  };
}

function examplePath(operation: Operation, userId: string) {
  return operation.path.replace(/\{[^}]+\}/, userId);
}

describe('BFF Identity HTTP contract', () => {
  it('opens the next transaction after PostgreSQL disconnects an active client', async () => {
    const database = new ServiceDatabase(databaseUrl, 'tropio_identity_runtime');
    try {
      let connectionClosed = false;
      const interrupted = database.transaction(async (client) => {
        const { rows: [connection] } = await client.query('SELECT pg_backend_pid() AS pid');
        const disconnected = new Promise<void>(resolve => client.once('end', resolve));
        await database.transaction(async (other) => {
          await other.query('RESET ROLE');
          await other.query('SELECT pg_terminate_backend($1)', [connection.pid]);
        });
        await disconnected;
        connectionClosed = true;
      });
      await expect(interrupted).rejects.toThrow();
      expect(connectionClosed).toBe(true);
      const resumed = await database.transaction(client => client.query('SELECT 1 AS value'));
      expect(resumed.rows).toEqual([{ value: 1 }]);
    }
    finally {
      await database.onModuleDestroy();
    }
  });

  it('keeps the same local demo login and profile after repeated provisioning', async () => {
    const provision = () => ensureLocalDemoAccount(databaseUrl, demoAccount);
    await Promise.all([provision(), provision()]);
    const { cookie, profile } = await login(demoAccount.email, demoAccount.password);
    expect(profile).toMatchObject({ id: demoAccount.id, display_name: demoAccount.displayName });
    expect(profile.avatar).toBeTruthy();
    const patch = await send('/me', {
      method: 'PATCH',
      cookie,
      csrf: profile.csrf_token,
      body: { display_name: 'После перезапуска' },
    });
    expect(patch.status).toBe(200);
    await provision();
    const again = await login(demoAccount.email, demoAccount.password);
    expect(again.profile).toMatchObject({ id: profile.id, display_name: 'После перезапуска' });
    expect((await send('/me', { cookie })).status).toBe(200);
  }, 20_000);

  it('preserves an existing account that already owns the requested demo email', async () => {
    const account = await accountSession();
    const fixture = { ...demoAccount, id: randomUUID(), email: account.email };
    await expect(ensureLocalDemoAccount(databaseUrl, fixture)).rejects.toThrow();
    expect((await login(account.email)).profile.id).toBe(account.profile.id);
    await problem('/auth/login', {
      method: 'POST',
      body: { email: account.email, password: fixture.password },
    }, 401, 'INVALID_CREDENTIALS');
  }, 20_000);

  it('supports local site names and limits database access to a loopback host', async () => {
    const remote = new URL(databaseUrl);
    remote.searchParams.set('host', 'identity.example.invalid');
    await expect(ensureLocalDemoAccount(remote.href, demoAccount)).resolves.toBe(false);
    remote.searchParams.set('host', 'identity.localhost');
    await expect(ensureLocalDemoAccount(remote.href, demoAccount)).resolves.toBe(false);
    await expect(ensureLocalDemoAccount(databaseUrl, demoAccount, {
      browserOrigin: 'http://tropio.localhost:3000',
      bffHost: 'bff.localhost',
      bffBaseUrl: 'http://bff.localhost:3001',
    })).resolves.toBe(true);
    await expect(ensureLocalDemoAccount(databaseUrl, demoAccount, {
      browserOrigin: 'https://tropio.example',
      bffHost: '127.0.0.1',
    })).resolves.toBe(false);
    await expect(ensureLocalDemoAccount(databaseUrl, demoAccount, {
      browserOrigin: origin,
      bffHost: '0.0.0.0',
    })).resolves.toBe(false);
    await expect(ensureLocalDemoAccount(databaseUrl, demoAccount, {
      bffBaseUrl: 'https://bff.example',
    })).resolves.toBe(false);
  });

  it('returns the BFF Problem for a missing session', async () => {
    await problem('/me', {}, 401, 'SESSION_REQUIRED');
  });

  it('AT-15 assigns one active system avatar on registration without a photo', async () => {
    const account = await register();
    await problem('/auth/login', { method: 'POST', body: { email: account.email, password } }, 401, 'INVALID_CREDENTIALS');
    await problem('/auth/verify-email', { method: 'POST', body: { token: account.token } }, 422, 'INVALID_AUTH_TOKEN');

    await verify(account);
    await problem('/auth/verify-email', { method: 'POST', body: { token: account.token }, cookie: account.registration }, 422, 'INVALID_AUTH_TOKEN');
    const { cookie, profile } = await login(account.email);
    const options = await activeAvatars();
    expect(profile.id).toMatch(uuid);
    expect(profile.csrf_token.length).toBeGreaterThan(20);
    expect(options).toContainEqual(profile.avatar);
    expect(profile).not.toHaveProperty('password_hash');
    expect(profile).not.toHaveProperty('email');

    const reread = await send('/me', { cookie });
    expect(reread.status).toBe(200);
    expect(await reread.json()).toEqual(profile);
  });

  it('AT-16 changes only the system avatar and validates current session and CSRF', async () => {
    const { cookie, profile } = await accountSession();
    const csrf = profile.csrf_token;
    const bio = 'Собираю необычные места';
    const displayName = 'Картограф';
    const edit = await send('/me', {
      method: 'PATCH',
      cookie,
      csrf,
      body: { display_name: displayName, bio },
    });
    expect(edit.status).toBe(200);
    const previous = await edit.json() as Me;
    expect(previous).toMatchObject({ display_name: displayName, bio });

    const options = await activeAvatars();
    const selected = options.find(({ id }) => id !== previous.avatar?.id);
    expect(selected).toBeDefined();
    const body = { avatar_id: selected!.id };
    await problem('/me/avatar', { method: 'PATCH', cookie, body }, 403, 'CSRF_REJECTED');
    await problem('/me/avatar', {
      method: 'PATCH',
      cookie,
      csrf,
      body: { avatar_id: randomUUID() },
    }, 422, 'AVATAR_UNAVAILABLE');

    const change = await send('/me/avatar', {
      method: 'PATCH',
      cookie,
      csrf,
      body,
    });
    expect(change.status).toBe(200);
    const updated = await change.json() as Me;
    expect(updated).toEqual({ ...previous, avatar: selected });
    const reread = await send('/me', { cookie });
    expect(reread.status).toBe(200);
    expect(await reread.json()).toEqual(updated);

    const summary = await send(`/users/${updated.id}`);
    expect(summary.status).toBe(200);
    expect(await summary.json()).toEqual({
      id: updated.id,
      display_name: displayName,
      bio: null,
      avatar: selected,
    });
    await problem(`/users/${randomUUID()}`, {}, 404, 'NOT_FOUND');

    const cleared = await send('/me', {
      method: 'PATCH',
      cookie,
      csrf,
      body: { bio: null },
    });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ ...updated, bio: null });
  });

  it('returns a neutral response for repeat registration and resends only to the initiating browser', async () => {
    const account = await register();
    const impostor = await send('/auth/register', {
      method: 'POST',
      body: { email: account.email, password: newPassword, accepted_terms: true },
    });
    expect(impostor.status).toBe(202);
    expect(await impostor.text()).toBe('');
    const impostorCookie = readCookie(impostor, 'tropio_registration');
    await problem('/auth/verify-email', {
      method: 'POST',
      body: { token: account.token },
      cookie: impostorCookie,
    }, 422, 'INVALID_AUTH_TOKEN');

    const known = await send('/auth/resend-verification', {
      method: 'POST',
      body: { email: account.email },
      cookie: account.registration,
    });
    const unknown = await send('/auth/resend-verification', { method: 'POST', body: { email: testEmail() } });
    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(await known.text()).toBe(await unknown.text());

    const resentToken = readToken(account.email, 'verify-email');
    expect(resentToken).not.toBe(account.token);
    await problem('/auth/verify-email', {
      method: 'POST',
      body: { token: account.token },
      cookie: account.registration,
    }, 422, 'INVALID_AUTH_TOKEN');
    await verify({ ...account, token: resentToken });

    const sentBefore = mail.length;
    const registration = await send('/auth/register', {
      method: 'POST',
      body: { email: account.email, password: newPassword, accepted_terms: true },
    });
    expect(registration.status).toBe(202);
    expect(await registration.text()).toBe('');
    readCookie(registration, 'tropio_registration');
    expect(mail).toHaveLength(sentBefore);
    await problem('/auth/login', { method: 'POST', body: { email: account.email, password: newPassword } }, 401, 'INVALID_CREDENTIALS');
    await login(account.email);
  });

  it('rotates a session once, rejects a stale cookie, and revokes the current session on logout', async () => {
    const { cookie, profile } = await accountSession();
    const csrf = profile.csrf_token;
    const refresh = { method: 'POST' as const, cookie, csrf };
    const results = await Promise.all([send('/auth/refresh', refresh), send('/auth/refresh', refresh)]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 401]);
    const good = results.find(({ status }) => status === 200)!;
    const stale = results.find(({ status }) => status === 401)!;
    await expectProblem(stale, { path: '/auth/refresh', method: 'POST' }, 401, 'SESSION_REQUIRED');
    const fresh = readCookie(good, 'tropio_session');
    const refreshed = await good.json() as Me;
    expect(fresh).not.toBe(cookie);
    expect(refreshed.csrf_token).not.toBe(csrf);
    await problem('/me', { cookie }, 401, 'SESSION_REQUIRED');

    const logout = await send('/auth/logout', { method: 'POST', cookie: fresh, csrf: refreshed.csrf_token });
    expect(logout.status).toBe(204);
    expect(logout.headers.getSetCookie().some(value => /^tropio_session=;/.test(value))).toBe(true);
    await problem('/me', { cookie: fresh }, 401, 'SESSION_REQUIRED');
  });

  it('keeps reset requests neutral, consumes the link once, and revokes earlier sessions', async () => {
    const { email, cookie } = await accountSession();
    const requestReset = (value: string) => send('/auth/request-password-reset', { method: 'POST', body: { email: value } });
    const unknown = testEmail();
    const existing = await requestReset(email);
    const absent = await requestReset(unknown);
    expect([existing.status, absent.status]).toEqual([202, 202]);
    expect(await existing.text()).toBe(await absent.text());
    expect(mail.some(message => message.email === unknown)).toBe(false);

    const body = { token: readToken(email, 'reset-password'), password: newPassword };
    const reset = await send('/auth/reset-password', { method: 'POST', body });
    expect(reset.status).toBe(204);
    await problem('/auth/reset-password', { method: 'POST', body }, 422, 'INVALID_AUTH_TOKEN');
    await problem('/me', { cookie }, 401, 'SESSION_REQUIRED');
    await problem('/auth/login', { method: 'POST', body: { email, password } }, 401, 'INVALID_CREDENTIALS');
    await login(email, newPassword);
  });

  it('matches declared input, Origin and session errors on every applicable operation', async () => {
    const session = await accountSession();
    await problem('/auth/register', { method: 'POST', rawBody: '{"email":' }, 400, 'INVALID_REQUEST');
    await problem('/auth/login', {
      method: 'POST',
      body: { email: session.email, password },
      origin: null,
    }, 403, 'CSRF_REJECTED');
    for (const operation of operations) {
      const expected = declaredPairs(operation);
      const path = examplePath(operation, session.profile.id);
      const input = requestFor(operation, session);
      if (expected.includes('400 INVALID_REQUEST')) {
        if (operation.method === 'GET') {
          await problem(examplePath(operation, 'invalid-id'), input, 400, 'INVALID_REQUEST');
        }
        else {
          await problem(path, { ...input, body: { unexpected: true } }, 400, 'INVALID_REQUEST');
        }
      }
      if (expected.includes('403 CSRF_REJECTED')) {
        await problem(path, { ...input, origin: foreignOrigin }, 403, 'CSRF_REJECTED');
      }
      if (expected.includes('401 SESSION_REQUIRED')) {
        await problem(path, { ...input, cookie: undefined }, 401, 'SESSION_REQUIRED');
      }
    }
  });

  it('maps database failures to the declared transient BFF error on every dependent operation', async () => {
    const session = await accountSession();
    const unavailableDatabase = new URL(databaseUrl);
    unavailableDatabase.pathname = `/missing_${randomUUID().replaceAll('-', '')}`;
    const unavailable = await start(unavailableDatabase.href);
    for (const operation of operations) {
      if (!declaredPairs(operation).includes('503 DEPENDENCY_UNAVAILABLE')) {
        continue;
      }
      const path = examplePath(operation, session.profile.id);
      await problem(path, requestFor(operation, session), 503, 'DEPENDENCY_UNAVAILABLE', unavailable);
    }
  });

  it('enforces each declared rate limit', async () => {
    const session = await accountSession();
    const limited = await start(databaseUrl, { source: 2, email: 2 });
    for (const operation of operations) {
      if (!declaredPairs(operation).includes('429 RATE_LIMITED')) {
        continue;
      }
      const path = examplePath(operation, session.profile.id);
      const input = requestFor(operation, session);
      let throttled = false;
      for (let hit = 0; hit < 3; hit += 1) {
        const response = await send(path, input, limited);
        if (response.status === 429) {
          await expectProblem(response, operation, 429, 'RATE_LIMITED');
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter !== null) {
            expect(Number(retryAfter)).toBeGreaterThan(0);
          }
          throttled = true;
          break;
        }
        await response.text();
      }
      expect(throttled, `${operation.path} accepted more than the configured burst`).toBe(true);
    }
  });

  it('uses the client IP only from an authenticated proxy for the rate limit', async () => {
    const proxySecret = randomBytes(32).toString('hex');
    const limited = await start(databaseUrl, { source: 1, email: 50 }, proxySecret);
    const path = '/auth/verify-email';
    const operation = { method: 'POST', path } as const;
    const request = { method: 'POST', body: { token: 'invalid-token' } } as const;
    const firstClient = { ...request, sourceIp: '192.0.2.12', proxySecret };
    const secondClient = { ...request, sourceIp: '192.0.2.13', proxySecret };

    await expectProblem(await send(path, firstClient, limited), operation, 422, 'INVALID_AUTH_TOKEN');
    await expectProblem(await send(path, firstClient, limited), operation, 429, 'RATE_LIMITED');
    await expectProblem(await send(path, secondClient, limited), operation, 422, 'INVALID_AUTH_TOKEN');

    await send(path, request, limited);
    const forged = { ...request, sourceIp: '192.0.2.14', proxySecret: 'unsigned' };
    await expectProblem(await send(path, forged, limited), operation, 429, 'RATE_LIMITED');
  });

  it('exercises every status and machine-code pair declared on GIS-02 operations', () => {
    const expected = operations.flatMap(operation => declaredPairs(operation)
      .map(pair => `${operation.method} ${operation.path} ${pair}`));
    expect([...verifiedPairs].sort()).toEqual([...new Set(expected)].sort());
  });
});
