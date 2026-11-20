import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { TLSSocket } from 'node:tls';

export const developmentLoginPath = '/api/dev/login-prefill';
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const loopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

function isLocalRequest(request: IncomingMessage & { originalUrl?: string }) {
  const { host, origin, 'sec-fetch-site': fetchSite } = request.headers;
  const { socket } = request;
  const path = (request.originalUrl ?? request.url)?.split('?', 1)[0];
  const protocol = socket instanceof TLSSocket && socket.encrypted ? 'https' : 'http';
  return request.method === 'GET' && path === developmentLoginPath
    && Boolean(socket.remoteAddress && loopbackAddresses.has(socket.remoteAddress))
    && Boolean(host && loopbackHost.test(host))
    && (!origin || origin === `${protocol}://${host}`)
    && (!fetchSite || fetchSite === 'same-origin');
}

export function prefillDevelopmentLogin(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
  if (!isLocalRequest(request)) {
    response.statusCode = 404;
    response.end();
    return;
  }

  const email = process.env.NUXT_DEV_LOGIN_EMAIL?.trim();
  const password = process.env.NUXT_DEV_LOGIN_PASSWORD;
  if (!email || !password) {
    response.statusCode = 204;
    response.end();
    return;
  }

  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ email, password }));
}
