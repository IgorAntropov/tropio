import type { NuxtApp } from '#app';
import {
  identityApi,
  IdentityResponseError,
} from '@fsd/shared/api';
import type { IdentityProfile } from '@fsd/shared/api';
import {
  getWorkspaceSessionStatus,
  mayCheckWorkspaceSession,
  workspaceConfirmedKey,
} from '@fsd/shared/session';
import type { WorkspaceSession } from '@fsd/shared/session';
import {
  isNavigationFailure,
  NavigationFailureType,
} from 'vue-router';
import type { RouteLocationNormalized } from 'vue-router';

const workspaceNavigations = new WeakMap<NuxtApp, {
  route: RouteLocationNormalized;
  controller: AbortController;
}>();

export function beginWorkspaceNavigation(route: RouteLocationNormalized) {
  const nuxtApp = useNuxtApp();
  const previous = workspaceNavigations.get(nuxtApp);
  previous?.controller.abort();
  if (import.meta.client && !previous) {
    useRouter().afterEach((to, _from, failure) => {
      if (!isNavigationFailure(failure, NavigationFailureType.duplicated)) {
        return;
      }
      const pending = workspaceNavigations.get(nuxtApp);
      if (pending?.route.fullPath !== to.fullPath) {
        pending?.controller.abort();
      }
    });
  }
  workspaceNavigations.set(nuxtApp, { route, controller: new AbortController() });
}

export async function verifyWorkspaceSession(
  to: RouteLocationNormalized,
): Promise<WorkspaceSession | undefined> {
  const nuxtApp = useNuxtApp();
  const navigation = workspaceNavigations.get(nuxtApp);
  if (navigation?.route !== to || navigation.controller.signal.aborted) {
    return;
  }
  if (import.meta.server && !mayCheckWorkspaceSession(useRequestHeaders(['cookie']).cookie)) {
    return;
  }

  const { signal } = navigation.controller;
  if (import.meta.client && nuxtApp.isHydrating && nuxtApp.payload.serverRendered) {
    const router = useRouter();
    onNuxtReady(() => {
      if (!signal.aborted && router.currentRoute.value.fullPath === to.fullPath) {
        void router.replace({
          path: to.path,
          query: to.query,
          hash: to.hash,
          force: true,
        }).catch(() => undefined);
      }
    });
    return;
  }

  const confirmed = useState<boolean | null>(workspaceConfirmedKey, () => null);
  let session: WorkspaceSession | undefined;
  if (import.meta.client) {
    try {
      session = getWorkspaceSessionStatus(200, await identityApi.me(signal));
    }
    catch (error) {
      session = error instanceof IdentityResponseError ? getWorkspaceSessionStatus(error.status, error) : 'unavailable';
    }
  }
  else {
    const fetch = useRequestFetch();
    await fetch<IdentityProfile>('/api/v1/me', {
      cache: 'no-store',
      credentials: 'same-origin',
      ignoreResponseError: true,
      retry: 0,
      signal,
      onResponse({ response }) {
        session = getWorkspaceSessionStatus(response.status, response._data);
      },
    }).catch(() => undefined);
  }
  if (signal.aborted) {
    return;
  }

  const status = session ?? 'unavailable';
  if (status === 'unavailable' && to.meta.publicWorkspace) {
    confirmed.value ??= false;
    return status;
  }
  confirmed.value = status === 'authenticated';
  if (status === 'unavailable') {
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      fatal: true,
      data: { retryPath: to.fullPath },
    });
  }
  return status;
}
