import type { IdentityProfile } from '@fsd/shared/api';

const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const workspacePaths = new RegExp(
  `^/(?:feed|chats|map|profile|trips(?:/${uuid}(?:/days/${uuid}/route)?)?)/?$`,
  'i',
);
const localOrigin = 'https://tropio.invalid';
const participationTarget = new RegExp(`^/catalog/${uuid}#participation$`, 'i');
const sessionCookie = /(?:^|;\s*)tropio_session=[^;\s]+/;

export const guestHome = '/catalog';
export const workspaceHome = '/feed';
export const workspaceConfirmedKey = 'workspace-session-confirmed';
export const workspaceMemberKey = 'workspace-member';
export const loginReadyKey = 'workspace-login-ready';

export type WorkspaceSession = 'authenticated' | 'guest' | 'unavailable';
export type WorkspaceMember = Pick<IdentityProfile, 'avatar' | 'display_name'>;

export function workspaceMemberOf({ avatar, display_name }: WorkspaceMember): WorkspaceMember {
  return { avatar, display_name };
}

export function mayCheckWorkspaceSession(cookie: string | undefined) {
  return sessionCookie.test(cookie ?? '');
}

export function getWorkspaceSessionStatus(status: number, data: unknown): WorkspaceSession {
  if (data && typeof data === 'object') {
    if (status === 200 && 'id' in data && typeof data.id === 'string' && data.id) {
      return 'authenticated';
    }
    if (status === 401 && 'code' in data && data.code === 'SESSION_REQUIRED') {
      return 'guest';
    }
  }
  return 'unavailable';
}

export function participationReturnPath(value: unknown): string | undefined {
  if (typeof value === 'string' && participationTarget.test(value)) {
    return value;
  }
}

export function workspaceReturnPath(value: unknown): string | undefined {
  const participation = participationReturnPath(value);
  if (participation) {
    return participation;
  }
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) {
    return;
  }
  const url = new URL(value, localOrigin);
  if (url.origin === localOrigin && workspacePaths.test(url.pathname)) {
    return url.pathname + url.search + url.hash;
  }
}
