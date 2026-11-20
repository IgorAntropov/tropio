import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  watch,
} from 'vue';
import type { InjectionKey } from 'vue';
import {
  editorApi,
  EditorResponseError,
  identityApi,
  IdentityResponseError,
} from '@fsd/shared/api';
import type { PublicTripSummary } from '@fsd/shared/api';

function participationContext(tripIds: () => readonly string[], refreshTrips: () => void) {
  const nuxt = useNuxtApp();
  const viewer = ref<string | null>();
  const sent = shallowRef(new Set<string>());
  const joined = shallowRef(new Set<string>());
  const busy = ref(new Set<string>());
  const errors = ref<Record<string, string>>({});
  const ids = computed(() => [...new Set(tripIds())].sort().join(','));
  const mounted = ref(false);
  const lifetime = new AbortController();
  let reading: AbortController | undefined;

  function clear() {
    reading?.abort();
    viewer.value = undefined;
    sent.value = new Set();
    joined.value = new Set();
    errors.value = {};
  }

  async function refresh() {
    reading?.abort();
    if (!mounted.value || document.hidden || !ids.value) {
      return;
    }
    const request = new AbortController();
    reading = request;
    try {
      const visible = ids.value.split(',');
      const pending = new Set<string>();
      const confirmed = new Set<string>();
      let currentViewer: string | null | undefined;
      for (let index = 0; index < visible.length; index += 100) {
        const page = await editorApi.getCatalogParticipation(visible.slice(index, index + 100), request.signal);
        if (currentViewer !== undefined && currentViewer !== page.viewer_id) {
          clear();
          return;
        }
        currentViewer = page.viewer_id;
        if (!currentViewer) {
          break;
        }
        for (const tripId of page.trip_ids) {
          pending.add(tripId);
        }
        for (const tripId of page.joined_trip_ids) {
          confirmed.add(tripId);
        }
      }
      if (!request.signal.aborted) {
        viewer.value = currentViewer;
        sent.value = pending;
        joined.value = confirmed;
      }
    }
    catch {
      if (!request.signal.aborted) {
        clear();
      }
    }
  }

  async function apply(tripId: string, mode: PublicTripSummary['admission_mode']) {
    if (busy.value.has(tripId)) {
      return;
    }
    const { signal } = lifetime;
    busy.value.add(tripId);
    errors.value[tripId] = '';
    let submittingViewer = viewer.value;
    const registration = () => nuxt.runWithContext(() =>
      navigateTo({ path: '/register', query: { returnTo: '/catalog/' + tripId + '#participation' } }));
    try {
      if (viewer.value === undefined) {
        await refresh();
      }
      submittingViewer = viewer.value;
      if (signal.aborted) {
        return;
      }
      if (viewer.value === null) {
        await registration();
        return;
      }
      if (viewer.value === undefined) {
        errors.value[tripId] = 'participation.unavailable';
        return;
      }
      const { id, csrf_token: csrf } = await identityApi.me(signal);
      if (signal.aborted || document.hidden) {
        return;
      }
      if (id !== submittingViewer || viewer.value !== submittingViewer) {
        await refresh();
        if (viewer.value === submittingViewer) {
          errors.value[tripId] = 'participation.sessionChanged';
        }
        return;
      }
      const result = await editorApi.requestTripParticipation(tripId, mode, { csrf, signal });
      if (signal.aborted || document.hidden || viewer.value !== submittingViewer) {
        return;
      }
      if (result.status === 'joined') {
        refreshTrips();
      }
      await refresh();
    }
    catch (error) {
      if (signal.aborted || document.hidden || viewer.value !== submittingViewer) {
        return;
      }
      if ((error instanceof IdentityResponseError || error instanceof EditorResponseError) && error.status === 401) {
        clear();
        await registration();
        return;
      }
      if (error instanceof EditorResponseError && error.status === 403) {
        errors.value[tripId] = 'participation.sessionChanged';
      }
      else if (error instanceof EditorResponseError && error.status === 404) {
        errors.value[tripId] = 'catalog.unavailableTrip';
      }
      else if (error instanceof EditorResponseError && error.status === 409) {
        errors.value[tripId] = 'participation.changed';
        refreshTrips();
        void refresh();
      }
      else {
        errors.value[tripId] = 'participation.unavailable';
      }
    }
    finally {
      busy.value.delete(tripId);
    }
  }

  const visibility = () => document.hidden ? clear() : void refresh();
  watch(ids, () => {
    void refresh();
  });
  onMounted(() => {
    mounted.value = true;
    void refresh();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', refresh);
    window.addEventListener('pagehide', clear);
  });
  onBeforeUnmount(() => {
    lifetime.abort();
    clear();
    if (import.meta.client) {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pagehide', clear);
    }
  });
  return {
    viewer,
    sent,
    joined,
    busy,
    errors,
    apply,
  };
}

const contextKey: InjectionKey<ReturnType<typeof participationContext>> = Symbol('trip-participation');

export function provideTripParticipation(tripIds: () => readonly string[], refreshTrips: () => void) {
  provide(contextKey, participationContext(tripIds, refreshTrips));
}

export function useTripParticipation() {
  const context = inject(contextKey);
  if (!context) {
    throw new Error('Trip participation context is required');
  }
  return context;
}
