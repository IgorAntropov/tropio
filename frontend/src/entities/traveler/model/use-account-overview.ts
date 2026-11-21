import type { NuxtApp } from '#app';
import {
  effectScope,
  onMounted,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
} from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import {
  identityApi,
  readFailureStatus,
  sessionEvents,
} from '@fsd/shared/api';
import type { AccountOverview } from '@fsd/shared/api';
import { workspaceMemberKey } from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';
import { useAccountSessionRecovery } from './use-account-session-recovery';

const stores = new WeakMap<NuxtApp, ReturnType<typeof createAccountOverviewStore>>();

export function createAccountOverviewStore(viewer: () => string | undefined, recoverSession: () => void, changes?: EventTarget) {
  const overview = shallowRef<AccountOverview>();
  const error = shallowRef<number>();
  let pending: AbortController | undefined;
  const version = shallowRef(0);

  function clear() {
    pending?.abort();
    pending = undefined;
    overview.value = undefined;
    error.value = undefined;
  }

  async function load(retry = false) {
    const id = viewer();
    if (!id || pending || overview.value || (error.value && !retry)) {
      return;
    }
    const controller = new AbortController();
    pending = controller;
    error.value = undefined;
    try {
      const result = await identityApi.overview(controller.signal);
      controller.signal.throwIfAborted();
      if (result.viewer_id === id) {
        overview.value = result;
      }
      else {
        clear();
        recoverSession();
      }
    }
    catch (failure) {
      if (!controller.signal.aborted) {
        error.value = readFailureStatus(failure);
        if (error.value === 401) {
          recoverSession();
        }
      }
    }
    finally {
      if (pending === controller) {
        pending = undefined;
      }
    }
  }

  function invalidate() {
    clear();
    version.value++;
  }

  function observe(active: MaybeRefOrGetter<boolean>) {
    watch([viewer, () => toValue(active), version], ([id, visible]) => {
      if (id && visible) {
        void load();
      }
    }, { immediate: true });
  }

  watch(viewer, clear, { flush: 'sync' });
  changes?.addEventListener('overview-changed', invalidate);
  changes?.addEventListener('overview-invalidated', invalidate);
  onScopeDispose(() => {
    clear();
    changes?.removeEventListener('overview-changed', invalidate);
    changes?.removeEventListener('overview-invalidated', invalidate);
  });
  return {
    overview,
    error,
    load,
    observe,
  };
}

export function useAccountOverview(active: MaybeRefOrGetter<boolean> = true) {
  const app = useNuxtApp();
  const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
  const viewer = () => member.value?.id;
  let store = stores.get(app);
  if (!store) {
    const recover = useAccountSessionRecovery();
    const scope = effectScope(true);
    store = scope.run(() => createAccountOverviewStore(viewer, recover, import.meta.client ? sessionEvents : undefined))!;
    app.vueApp.onUnmount(() => scope.stop());
    stores.set(app, store);
  }
  const { overview, error, load, observe } = store;
  onMounted(() => observe(active));
  return { overview, error, reload: () => load(true) };
}
