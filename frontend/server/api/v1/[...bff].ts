import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const identityRoutes = new Set([
  'POST auth/login',
  'POST auth/register',
  'POST auth/resend-verification',
  'POST auth/verify-email',
  'POST auth/refresh',
  'POST auth/logout',
  'POST auth/request-password-reset',
  'POST auth/reset-password',
  'GET me',
  'PATCH me',
  'PATCH me/avatar',
  'GET avatar-assets',
]);

const editorRoutes = new Set([
  'GET me/trips',
  'GET me/equipment',
  'POST me/equipment',
  'GET catalog/participation',
  'GET trips',
  'POST trips',
  'POST routing/calculate',
  'GET poi-categories',
  'GET pois',
  'POST pois',
]);

const editorPaths = [
  /^GET trips\/[^/]+\/roster$/,
  /^PUT trips\/[^/]+\/roster\/[^/]+$/,
  /^(GET|PUT) me\/favorites\/[^/]+$/,
  /^POST trips\/[^/]+\/applications$/,
  /^PATCH trips\/[^/]+$/,
  /^POST trips\/[^/]+\/(?:publish|unpublish|archive)$/,
  /^GET trips\/[^/]+\/publication-operations\/[^/]+$/,
  /^GET trips\/[^/]+\/draft$/,
  /^GET trips\/[^/]+\/covers\/[^/]+$/,
  /^PUT days\/[^/]+\/route$/,
  /^(GET|PUT) routes\/[^/]+$/,
  /^POST routes\/[^/]+\/restore$/,
  /^POST tracks\/[^/]+\/split$/,
  /^GET pois\/[^/]+(?:\/media\/[^/]+)?$/,
];

const mediaPath = /^(?:pois\/[^/]+\/media|(?:catalog\/)?trips\/[^/]+\/covers)\/[^/]+$/;
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const identityCookies = ['tropio_session', 'tropio_registration'];
const editorCookies = ['tropio_session'];

function bodyLimit(methodPath: string) {
  if (methodPath === 'POST trips' || /^PATCH trips\/[^/]+$/.test(methodPath)) {
    return 3 * 1024 * 1024;
  }
  return /^POST trips\/[^/]+\/publish$/.test(methodPath) || /^PUT (?:days\/[^/]+\/route|routes\/[^/]+)$/.test(methodPath)
    ? 256 * 1024
    : 8 * 1024;
}

type Event = Parameters<typeof getRequestURL>[0];

function problem(event: Event, requestId: string, status: number, code: string, title: string) {
  setResponseStatus(event, status);
  setResponseHeader(event, 'content-type', 'application/problem+json');
  setResponseHeader(event, 'x-request-id', requestId);
  return {
    type: 'about:blank',
    title,
    status,
    code,
    request_id: requestId,
  };
}

async function boundedBody(event: Event, maxBodyBytes: number) {
  const request = event.node.req;
  if (Number(getRequestHeader(event, 'content-length')) > maxBodyBytes) {
    request.resume();
    return null;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maxBodyBytes) {
      request.resume();
      return null;
    }
    chunks.push(bytes);
  }
  return size ? new Uint8Array(Buffer.concat(chunks)) : undefined;
}

function safePath(path: string): string | null {
  try {
    const segments = path.split('/').map(segment => decodeURIComponent(segment));
    if (segments.some(segment => segment === '.' || segment === '..' || /[/\\]/.test(segment)
      || [...segment].some(character => character < ' ' || character.charCodeAt(0) === 127))) {
      return null;
    }
    return segments.map(segment => encodeURIComponent(segment)).join('/');
  }
  catch {
    return null;
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store');
  const method = getMethod(event);
  const [rawPath, rawQuery] = (event.node.req.url ?? '').split(/\?(.*)/s, 2);
  const path = rawPath?.startsWith('/api/v1/') ? rawPath.slice('/api/v1/'.length) : '';
  const incomingId = getRequestHeader(event, 'x-request-id');
  const requestId = incomingId && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(incomingId) ? incomingId : randomUUID();
  const methodPath = `${method} ${path}`;
  const participation = methodPath === 'GET catalog/participation';
  const account = path === 'me/trips' || path.startsWith('me/favorites/') || /^trips\/[^/]+\/roster(?:\/|$)/.test(path);
  if (account) {
    setResponseHeader(event, 'cache-control', 'private, no-store');
  }
  if (participation || account) {
    setResponseHeader(event, 'vary', 'Cookie');
  }
  const identity = identityRoutes.has(methodPath) || /^GET users\/[^/]+$/.test(methodPath);
  const catalog = methodPath === 'GET catalog/filter-options' || /^GET catalog\/trips(?:\/[^/]+(?:\/covers\/[^/]+)?)?$/.test(methodPath);
  if (!identity && !catalog && !editorRoutes.has(methodPath) && !editorPaths.some(pattern => pattern.test(methodPath))) {
    return problem(event, requestId, 404, 'NOT_FOUND', 'Not found');
  }
  const upstreamPath = safePath(path);
  if (upstreamPath === null) {
    return problem(event, requestId, 400, 'INVALID_REQUEST', 'Invalid request');
  }

  const config = useRuntimeConfig(event);
  const media = mediaPath.test(path);
  const accept = media ? imageTypes.join(', ') : 'application/json';
  const headers = new Headers({ 'accept': `${accept}, application/problem+json`, 'x-request-id': requestId });
  const allowedHeaders = catalog || participation ? [] : ['content-type', 'origin', 'x-csrf-token', ...(!identity ? ['idempotency-key'] : [])];
  for (const name of allowedHeaders) {
    const value = getRequestHeader(event, name);
    if (value) {
      headers.set(name, value);
    }
  }

  const cookieNames = catalog ? [] : identity ? identityCookies : editorCookies;
  const cookies = cookieNames.flatMap((name) => {
    const value = getCookie(event, name);
    return value && /^[\w.-]{1,256}$/.test(value) ? [`${name}=${value}`] : [];
  });
  if (cookies.length) {
    headers.set('cookie', cookies.join('; '));
  }

  const clientIP = getRequestIP(event);
  if (config.bffProxySecret && clientIP && isIP(clientIP)) {
    headers.set('x-tropio-proxy-secret', config.bffProxySecret);
    headers.set('x-tropio-client-ip', clientIP);
  }

  let body: Uint8Array<ArrayBuffer> | undefined;
  if (method !== 'GET') {
    const input = await boundedBody(event, bodyLimit(methodPath)).catch(() => null);
    if (input === null) {
      return problem(event, requestId, 400, 'INVALID_REQUEST', 'Invalid request');
    }
    body = input;
  }

  const unavailable = () => problem(event, requestId, 503, 'DEPENDENCY_UNAVAILABLE', identity ? 'Identity unavailable' : 'Editor unavailable');
  try {
    const url = new URL(`/api/v1/${upstreamPath}`, config.bffBaseUrl);
    if (!identity && rawQuery) {
      url.search = rawQuery;
    }
    const response = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(identity ? 5000 : 20_000),
    });
    const type = response.headers.get('content-type');
    const mime = type?.split(';', 1)[0]?.trim().toLowerCase();
    if (!response.ok && mime !== 'application/problem+json') {
      await response.body?.cancel();
      return unavailable();
    }

    const image = media && response.ok;
    if (image && (!mime || !imageTypes.includes(mime) || !response.body)) {
      await response.body?.cancel();
      return unavailable();
    }
    const payload = image || response.status === 204 || (identity && response.status === 202) ? null : await response.text();
    setResponseStatus(event, response.status);
    setResponseHeader(event, 'x-request-id', response.headers.get('x-request-id') ?? requestId);
    if (type) {
      setResponseHeader(event, 'content-type', type);
    }
    const location = response.headers.get('location');
    if (response.status === 202 && location && /^\/api\/v1\/trips\/[\da-f-]{36}\/publication-operations\/[\da-f-]{36}$/i.test(location)) {
      setResponseHeader(event, 'location', location);
    }
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter && /^\d+$/.test(retryAfter)) {
      setResponseHeader(event, 'retry-after', Number(retryAfter));
    }

    if (identity) {
      for (const cookie of response.headers.getSetCookie()) {
        if (identityCookies.some(name => cookie.startsWith(`${name}=`))) {
          appendResponseHeader(event, 'set-cookie', cookie);
        }
      }
    }
    if (image && response.body) {
      setResponseHeader(event, 'x-content-type-options', 'nosniff');
      return sendStream(event, response.body);
    }
    if (payload === null) {
      return sendNoContent(event, response.status);
    }
    return send(event, payload);
  }
  catch {
    return unavailable();
  }
});
