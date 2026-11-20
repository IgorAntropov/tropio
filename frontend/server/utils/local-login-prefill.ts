import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { TLSSocket } from 'node:tls';
import demoAccount from '../../../fixtures/demo-account.json' with { type: 'json' };
import { isLoopbackHost } from '../../shared/utils/loopback-host.ts';

export const localLoginPath = '/api/dev/login-prefill';
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLocalRequest(request: IncomingMessage & { originalUrl?: string }) {
  const { host, origin, 'sec-fetch-site': fetchSite } = request.headers;
  const { socket } = request;
  const path = (request.originalUrl ?? request.url)?.split('?', 1)[0];
  const protocol = socket instanceof TLSSocket && socket.encrypted ? 'https' : 'http';
  return request.method === 'GET' && path === localLoginPath
    && Boolean(socket.remoteAddress && loopbackAddresses.has(socket.remoteAddress))
    && isLoopbackHost(host)
    && (!origin || origin === `${protocol}://${host}`)
    && (!fetchSite || fetchSite === 'same-origin');
}

export function prefillLocalLogin(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
  if (!isLocalRequest(request)) {
    response.statusCode = 404;
    response.end();
    return;
  }

  if (process.env.NUXT_LOCAL_DEMO_LOGIN === '0') {
    response.statusCode = 204;
    response.end();
    return;
  }

  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ email: demoAccount.email, password: demoAccount.password }));
}
