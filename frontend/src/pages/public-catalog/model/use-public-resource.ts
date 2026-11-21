import {
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';
import { readFailureStatus } from '@fsd/shared/api';

export function usePublicResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>, options: { live?: boolean } = {}) {
  const hidden = ref(false);
  const resource = useAsyncData(key, async (_app, { signal }) => {
    try {
      const body = await load(signal);
      signal.throwIfAborted();
      return { status: 200, body };
    }
    catch (error) {
      signal.throwIfAborted();
      return { status: readFailureStatus(error), body: null };
    }
  }, {
    deep: false,
    getCachedData: (id, app) => app.isHydrating ? app.payload.data[id] : undefined,
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  const refresh = (dedupe: 'cancel' | 'defer') => {
    if (document.visibilityState === 'hidden') {
      return;
    }
    hidden.value = false;
    void resource.refresh({ dedupe });
  };
  const check = () => refresh('defer');
  const suspend = () => {
    hidden.value = true;
    resource.clear();
  };
  const visibility = () => document.visibilityState === 'hidden' ? suspend() : check();
  const show = (event: PageTransitionEvent) => {
    if (event.persisted) {
      check();
    }
  };

  onMounted(() => {
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', show);
    if (options.live !== false) {
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', visibility);
      timer = setInterval(check, 30_000);
    }
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    if (import.meta.client) {
      window.removeEventListener('focus', check);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', show);
      document.removeEventListener('visibilitychange', visibility);
    }
    resource.clear();
  });

  return {
    ready: resource,
    value: computed(() => hidden.value ? null : resource.data.value?.body),
    status: computed(() => hidden.value ? undefined : resource.data.value?.status),
    pending: resource.pending,
    refresh: () => refresh('cancel'),
    clear: resource.clear,
  };
}
