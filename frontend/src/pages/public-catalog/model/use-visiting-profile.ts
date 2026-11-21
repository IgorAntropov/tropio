import type { Ref } from 'vue';
import {
  identityApi,
  isResourceId,
  readFailureStatus,
} from '@fsd/shared/api';
import type { VisitingProfile } from '@fsd/shared/api';
import { useAccountSessionRecovery } from '@fsd/entities/traveler';

export function useVisitingProfile(target: Ref<string>, viewer: Ref<string | undefined>) {
  const recoverSession = useAccountSessionRecovery();
  const data = shallowRef<VisitingProfile>();
  const status = ref<number>();
  const pending = ref(false);
  let active: AbortController | undefined;

  function clear() {
    active?.abort();
    active = undefined;
    data.value = undefined;
    status.value = undefined;
    pending.value = false;
  }

  async function refresh() {
    clear();
    const viewerId = viewer.value;
    const targetId = target.value;
    if (!viewerId || viewerId === targetId || !isResourceId(targetId)) {
      return;
    }
    const request = new AbortController();
    active = request;
    pending.value = true;
    try {
      const result = await identityApi.visitingProfile(targetId, request.signal);
      request.signal.throwIfAborted();
      if (result.viewer_id !== viewerId) {
        recoverSession();
      }
      else if (result.profile.id === targetId) {
        data.value = result;
      }
      else {
        status.value = 503;
      }
    }
    catch (error) {
      if (!request.signal.aborted) {
        const code = readFailureStatus(error);
        if (code === 401) {
          recoverSession();
        }
        else {
          status.value = code;
        }
      }
    }
    finally {
      if (active === request) {
        active = undefined;
        pending.value = false;
      }
    }
  }

  function restored(event: PageTransitionEvent) {
    if (event.persisted) {
      void refresh();
    }
  }

  onMounted(() => {
    watch([viewer, target], refresh, { immediate: true, flush: 'sync' });
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', restored);
  });
  onBeforeUnmount(() => {
    clear();
    window.removeEventListener('pagehide', clear);
    window.removeEventListener('pageshow', restored);
  });
  return {
    data,
    status,
    pending,
    refresh,
  };
}
