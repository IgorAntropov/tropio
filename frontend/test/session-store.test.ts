import {
  expect,
  it,
  vi,
} from 'vitest';
import type { IdentityProfile } from '../src/shared/api/identity';
import { createSessionStore } from '../src/shared/api/session-store';

const traveler: IdentityProfile = {
  id: 'cff29d36-969a-4805-983e-e01201e0449b',
  display_name: 'Турист',
  avatar: null,
  bio: null,
  csrf_token: 'session-a',
};
const guest = () => new Error('SESSION_REQUIRED');

it('shares one profile read and lets another consumer continue after navigation is cancelled', async () => {
  const store = createSessionStore();
  const pending = Promise.withResolvers<IdentityProfile>();
  const load = vi.fn((_signal: AbortSignal) => pending.promise);
  const navigation = new AbortController();
  const page = new AbortController();

  const cancelled = store.read(load, navigation.signal, guest);
  const current = store.read(load, page.signal, guest);
  navigation.abort();
  expect(load).toHaveBeenCalledOnce();
  expect(load.mock.calls[0]![0].aborted).toBe(false);
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  pending.resolve(traveler);
  await expect(current).resolves.toEqual(traveler);
  await expect(store.read(load, page.signal, guest)).resolves.toEqual(traveler);
  expect(load).toHaveBeenCalledOnce();
});

it('discards a previous account response and serves the updated profile and guest state from memory', async () => {
  const store = createSessionStore();
  const pending = Promise.withResolvers<IdentityProfile>();
  const load = vi.fn((_signal: AbortSignal) => pending.promise);
  const signal = new AbortController().signal;
  const previous = store.read(load, signal, guest);
  const signedIn = { ...traveler, id: '06e221c9-a1be-4a66-bd5d-533110147006', csrf_token: 'session-b' };
  store.replace(signedIn);
  expect(load.mock.calls[0]![0].aborted).toBe(true);
  pending.resolve(traveler);
  await expect(previous).rejects.toMatchObject({ name: 'AbortError' });
  await expect(store.read(load, signal, guest)).resolves.toEqual(signedIn);

  const updated = { ...signedIn, bio: 'В пути' };
  store.replace(updated);
  await expect(store.read(load, signal, guest)).resolves.toEqual(updated);
  store.replace(null);
  await expect(store.read(load, signal, guest)).rejects.toThrow('SESSION_REQUIRED');
  expect(load).toHaveBeenCalledOnce();
});

it('retries a transient failure without caching it as a signed-out session', async () => {
  const store = createSessionStore();
  const load = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(traveler);
  const signal = new AbortController().signal;
  await expect(store.read(load, signal, guest)).rejects.toThrow('Unavailable');
  expect(store.profile.value).toBeUndefined();
  await expect(store.read(load, signal, guest)).resolves.toEqual(traveler);
  expect(load).toHaveBeenCalledTimes(2);
});

it('sends one cold GET me, uses login and save responses and ignores a stale 401 after another login', async () => {
  vi.resetModules();
  vi.stubGlobal('window', new EventTarget());
  const pending = Promise.withResolvers<Response>();
  const updated = { ...traveler, bio: 'У моря' };
  const next = { ...traveler, id: '3e060fec-1692-4250-b20d-44cc041f3a83', csrf_token: 'session-c' };
  const cold = { ...traveler, display_name: 'Путешественница' };
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(cold))
    .mockResolvedValueOnce(Response.json(traveler))
    .mockResolvedValueOnce(Response.json(updated))
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(Response.json(next))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', request);
  const signal = new AbortController().signal;
  const credentials = { email: 'traveler@example.test', password: 'test-password' };
  try {
    const { identityApi } = await import('../src/shared/api/identity');
    await expect(Promise.all([identityApi.me(signal), identityApi.me(signal)])).resolves.toEqual([cold, cold]);
    await expect(identityApi.me(signal)).resolves.toEqual(cold);
    expect(request).toHaveBeenCalledOnce();
    await identityApi.login(credentials, signal);
    await expect(identityApi.me(signal)).resolves.toEqual(traveler);
    await identityApi.updateProfile({ bio: updated.bio }, traveler.csrf_token, signal);
    await expect(identityApi.me(signal)).resolves.toEqual(updated);
    const previous = identityApi.overview(signal);
    await identityApi.login(credentials, signal);
    pending.resolve(Response.json({ code: 'SESSION_REQUIRED' }, { status: 401 }));
    await expect(previous).rejects.toMatchObject({ status: 401 });
    await expect(identityApi.me(signal)).resolves.toEqual(next);
    await identityApi.logout(next.csrf_token, signal);
    await expect(identityApi.me(signal)).rejects.toMatchObject({ code: 'SESSION_REQUIRED' });
    expect(request.mock.calls.map(([url, options]) => [options?.method, url])).toEqual([
      ['GET', '/api/v1/me'],
      ['POST', '/api/v1/auth/login'],
      ['PATCH', '/api/v1/me'],
      ['GET', '/api/v1/me/overview'],
      ['POST', '/api/v1/auth/login'],
      ['POST', '/api/v1/auth/logout'],
    ]);
  }
  finally {
    vi.unstubAllGlobals();
    vi.resetModules();
  }
});
