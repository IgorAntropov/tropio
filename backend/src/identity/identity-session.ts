import type { NodeRequest } from '@nestjs/platform-node';
import { BffProblem } from '../http/bff-problem.js';
import {
  csrfToken,
  equalSecret,
} from './identity-crypto.js';

export const sessionCookie = 'tropio_session';
export const registrationCookie = 'tropio_registration';

export function readToken(request: NodeRequest, name: string): string | undefined {
  const matching = (request.headers.cookie ?? '').split(';')
    .map(part => part.trim())
    .filter(part => part.startsWith(`${name}=`));
  const value = matching.length === 1 ? matching[0]?.slice(name.length + 1) : undefined;
  return value && /^[a-zA-Z0-9_-]{43}$/.test(value) ? value : undefined;
}

export function requireSession(request: NodeRequest): string {
  const token = readToken(request, sessionCookie);
  if (!token) {
    throw new BffProblem('SESSION_REQUIRED');
  }
  return token;
}

export function checkOrigin(request: NodeRequest, browserOrigin: string): void {
  if (request.headers.origin !== browserOrigin) {
    throw new BffProblem('CSRF_REJECTED');
  }
}

export function mutationSession(request: NodeRequest, browserOrigin: string): string {
  const token = requireSession(request);
  checkOrigin(request, browserOrigin);
  const csrf = request.headers['x-csrf-token'];
  if (typeof csrf !== 'string' || !equalSecret(csrf, csrfToken(token))) {
    throw new BffProblem('CSRF_REJECTED');
  }
  return token;
}
