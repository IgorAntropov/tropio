import { IdentityResponseError } from '@fsd/shared/api';
import { computed } from 'vue';
import account from '../../../fixtures/demo-account.json';

export function useDemoAccount() {
  const session = useCookie<string | null>('tropio_pages_demo', {
    sameSite: 'lax',
    path: useRuntimeConfig().app.baseURL,
    maxAge: 60 * 60 * 24 * 30,
  });
  function signIn(credentials: { email: string; password: string }) {
    if (credentials.email.toLowerCase() !== account.email || credentials.password !== account.password) {
      throw new IdentityResponseError(401, 'INVALID_CREDENTIALS');
    }
    session.value = account.id;
  }
  function signOut() {
    session.value = null;
  }
  return {
    displayName: account.displayName,
    signedIn: computed(() => session.value === account.id),
    login: { credentials: { email: account.email, password: account.password }, signIn },
    signOut,
  };
}
