import {
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';

export function usePublicResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const hidden = ref(false);
  const resource = useAsyncData(key, async (_app, { signal }) => {
    try {
      const body = await load(signal);
      signal.throwIfAborted();
      return { status: 200, body };
    }
    catch (error) {
      signal.throwIfAborted();
      const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 503;
      return { status: status === 404 || status === 400 ? status : 503, body: null };
    }
  }, {
    deep: false,
    getCachedData: (id, app) => app.isHydrating ? app.payload.data[id] : undefined,
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  const check = () => {
    if (document.visibilityState === 'hidden') {
      return;
    }
    hidden.value = false;
    void resource.refresh({ dedupe: 'cancel' });
  };
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
    window.addEventListener('focus', check);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', show);
    document.addEventListener('visibilitychange', visibility);
    timer = setInterval(check, 30_000);
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
    refresh: check,
    clear: resource.clear,
  };
}
