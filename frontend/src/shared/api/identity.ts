import type { components } from './openapi';
import {
  browserSession,
  reportSessionFailure,
  sessionEvents,
} from './session-store';

type Schemas = components['schemas'];

export type IdentityProfile = Schemas['IdentityProfile'];
export type AccountOverview = Schemas['AccountOverview'];
export type PublicProfileOverview = Schemas['PublicProfileOverview'];
export type VisitingProfile = Schemas['VisitingProfile'];
export type PublicIdentityProfile = Schemas['PublicIdentityProfile'];
export type SystemAvatar = Schemas['SystemAvatar'];

export class IdentityResponseError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`${status} ${code}`);
  }
}

const messages: Record<string, string> = {
  '400:INVALID_REQUEST': 'identity.errors.invalidRequest',
  '401:INVALID_CREDENTIALS': 'identity.errors.invalidCredentials',
  '401:SESSION_REQUIRED': 'identity.errors.sessionRequired',
  '403:CSRF_REJECTED': 'identity.errors.csrfRejected',
  '404:NOT_FOUND': 'identity.errors.notFound',
  '422:INVALID_AUTH_TOKEN': 'identity.errors.invalidToken',
  '422:AVATAR_UNAVAILABLE': 'identity.errors.avatarUnavailable',
  '429:RATE_LIMITED': 'identity.errors.rateLimited',
  '503:DEPENDENCY_UNAVAILABLE': 'identity.errors.unavailable',
};

export function identityErrorMessage(error: unknown) {
  if (error instanceof IdentityResponseError) {
    return messages[`${error.status}:${error.code}`] ?? 'identity.errors.unexpected';
  }
  return error instanceof TypeError ? 'identity.errors.unavailable' : 'identity.errors.unexpected';
}

async function call<T>(path: string, options: {
  method?: 'POST' | 'PATCH';
  body?: object;
  csrf?: string;
  signal?: AbortSignal;
} = {}): Promise<T> {
  const headers = new Headers({ accept: 'application/json, application/problem+json' });
  if (options.body) {
    headers.set('content-type', 'application/json');
  }
  if (options.csrf) {
    headers.set('x-csrf-token', options.csrf);
  }

  const revision = browserSession?.revision();
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    signal: options.signal,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    const code = typeof problem === 'object' && problem !== null
      && 'code' in problem && typeof problem.code === 'string'
      ? problem.code
      : '';
    options.signal?.throwIfAborted();
    reportSessionFailure(response.status, code, revision);
    throw new IdentityResponseError(response.status, code);
  }
  return response.status === 202 || response.status === 204
    ? undefined as T
    : await response.json() as T;
}

function readMe(signal: AbortSignal) {
  return call<IdentityProfile>('/me', { signal });
}

async function saveProfile(path: '/me' | '/me/avatar', body: Schemas['UpdateIdentityProfileRequest'] | Schemas['SelectIdentityAvatarRequest'], csrf: string, signal: AbortSignal) {
  const revision = browserSession?.revision();
  const result = await call<IdentityProfile>(path, {
    method: 'PATCH',
    body,
    csrf,
    signal,
  });
  if (browserSession && browserSession.revision() === revision) {
    browserSession.replace(result);
    sessionEvents.dispatchEvent(new Event('profile-updated'));
  }
  return result;
}

export const identityApi = {
  async login(body: Schemas['LoginIdentityRequest'], signal: AbortSignal) {
    const result = await call<IdentityProfile>('/auth/login', { method: 'POST', body, signal });
    browserSession?.replace(result);
    if (browserSession) {
      sessionEvents.dispatchEvent(new Event('changed'));
    }
    return result;
  },
  register: (body: Schemas['RegisterIdentityRequest'], signal: AbortSignal) =>
    call<undefined>('/auth/register', { method: 'POST', body, signal }),
  resendVerification: (body: Schemas['IdentityEmailRequest'], signal: AbortSignal) =>
    call<undefined>('/auth/resend-verification', { method: 'POST', body, signal }),
  verifyEmail: (body: Schemas['IdentityTokenRequest'], signal: AbortSignal) =>
    call<undefined>('/auth/verify-email', { method: 'POST', body, signal }),
  requestPasswordReset: (body: Schemas['IdentityEmailRequest'], signal: AbortSignal) =>
    call<undefined>('/auth/request-password-reset', { method: 'POST', body, signal }),
  async resetPassword(body: Schemas['ResetIdentityPasswordRequest'], signal: AbortSignal) {
    await call<undefined>('/auth/reset-password', { method: 'POST', body, signal });
    if (browserSession) {
      browserSession.replace(undefined);
      sessionEvents.dispatchEvent(new Event('changed'));
    }
  },
  me: (signal: AbortSignal) => browserSession
    ? browserSession.read(readMe, signal, () => new IdentityResponseError(401, 'SESSION_REQUIRED'))
    : readMe(signal),
  overview: (signal: AbortSignal) => call<AccountOverview>('/me/overview', { signal }),
  visitingProfile: (id: string, signal: AbortSignal) => call<VisitingProfile>('/me/visiting/' + encodeURIComponent(id), { signal }),
  updateProfile: (body: Schemas['UpdateIdentityProfileRequest'], csrf: string, signal: AbortSignal) =>
    saveProfile('/me', body, csrf, signal),
  avatarAssets: (signal: AbortSignal) => call<Schemas['SystemAvatarList']>('/avatar-assets', { signal }),
  selectAvatar: (body: Schemas['SelectIdentityAvatarRequest'], csrf: string, signal: AbortSignal) =>
    saveProfile('/me/avatar', body, csrf, signal),
  async logout(csrf: string, signal: AbortSignal) {
    await call<undefined>('/auth/logout', { method: 'POST', csrf, signal });
    browserSession?.replace(null);
    if (browserSession) {
      sessionEvents.dispatchEvent(new Event('changed'));
    }
  },
};
