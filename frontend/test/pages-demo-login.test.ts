import { ref } from 'vue';
import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import account from '../../fixtures/demo-account.json';
import { useDemoAccount } from '../demo/composables/useDemoAccount';

vi.mock('@fsd/shared/api', () => import('../src/shared/api'));

afterEach(() => vi.unstubAllGlobals());

it('signs in with the Pages prefill, restores the browser session and signs out', () => {
  const cookie = ref<string | null>(null);
  const useCookie = vi.fn(() => cookie);
  const request = vi.fn();
  vi.stubGlobal('useCookie', useCookie);
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/tropio/' } }));
  vi.stubGlobal('fetch', request);

  const guest = useDemoAccount();
  const { credentials, signIn } = guest.login;
  expect(credentials).toEqual({ email: account.email, password: account.password });
  expect(guest.signedIn.value).toBe(false);
  expect(() => signIn({ ...credentials, password: 'incorrect' })).toThrow('INVALID_CREDENTIALS');
  expect(() => signIn({ ...credentials, email: 'other@example.test' })).toThrow('INVALID_CREDENTIALS');
  expect(cookie.value).toBeNull();

  signIn(credentials);
  expect(cookie.value).toBe(account.id);
  const reopened = useDemoAccount();
  expect(reopened.signedIn.value).toBe(true);
  expect(reopened.displayName).toBe(account.displayName);
  reopened.signOut();
  expect(useDemoAccount().signedIn.value).toBe(false);
  expect(useCookie).toHaveBeenCalledWith('tropio_pages_demo', expect.objectContaining({ path: '/tropio/' }));
  expect(request).not.toHaveBeenCalled();
});
