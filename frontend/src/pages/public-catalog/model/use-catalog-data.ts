import type {
  PublicTrip,
  PublicTripPage,
} from '@fsd/shared/api';
import {
  isResourceId,
  readFailureStatus,
} from '@fsd/shared/api';
import {
  readListDepth,
  writeListDepth,
} from '@fsd/shared/navigation';
import { catalogFilters } from './catalog';
import { useCatalogPages } from './use-catalog-pages';
import { useCatalogScreens } from './use-catalog-screens';
import { usePublicResource } from './use-public-resource';

function readTrip(id: string, signal: AbortSignal) {
  return $fetch<PublicTrip>('/api/v1/catalog/trips/' + encodeURIComponent(id), {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    retry: 0,
  });
}

export function useCatalogData() {
  const route = useRoute();
  const expandedId = computed(() => typeof route.params.tripId === 'string' ? route.params.tripId.toLowerCase() : '');
  const catalogVisited = ref(!expandedId.value);
  const filters = computed(() => catalogFilters(route.query));
  const near = ref<string>();
  const showNearbyNotice = computed(() => !!near.value && !filters.value.bbox && !filters.value.region);
  const screens = useCatalogScreens(expandedId);
  const { mobile, mode } = screens;
  const withdrawn = reactive(new Map<string, number>());
  let accessCheck = 0;

  const pageQuery = computed(() => {
    const params = { ...filters.value };
    if (near.value && !params.bbox && !params.region) {
      params.near = near.value;
      if (typeof route.query.radius_km === 'string') {
        params.radius_km = route.query.radius_km;
      }
    }
    return params;
  });
  async function verifyWithdrawn(items: PublicTripPage['items'], signal: AbortSignal) {
    const verified: [string, number][] = [];
    if (!withdrawn.size) {
      return verified;
    }
    const unique = new Map(items.map(item => [item.trip_id, item]));
    for (const [id, check] of withdrawn) {
      const listed = unique.get(id);
      if (!listed) {
        continue;
      }
      try {
        const published = await readTrip(id, signal);
        if (published.trip_id === id && published.publication_id === listed.publication_id) {
          verified.push([id, check]);
        }
      }
      catch {
        signal.throwIfAborted();
      }
    }
    return verified;
  }
  const { value: catalogPage, status, pending, clear, refresh, ready, loadingNext, nextError, more } = useCatalogPages(
    () => catalogVisited.value,
    () => pageQuery.value,
    verifyWithdrawn,
    () => readListDepth(route.fullPath, 'catalog'),
  );
  watch([() => route.fullPath, () => catalogPage.value?.depth], ([path, depth]) => {
    if (route.path === '/catalog' && depth) {
      writeListDepth(path, 'catalog', depth);
    }
  }, { flush: 'post' });
  watchEffect(() => {
    if (mobile.value && mode.value === 'map' && !expandedId.value && !pending.value && !nextError.value
      && catalogPage.value?.depth === 1 && catalogPage.value.next_cursor) {
      void more();
    }
  });
  watch(catalogPage, (page) => {
    for (const [id, check] of page?.verified ?? []) {
      if (withdrawn.get(id) === check) {
        withdrawn.delete(id);
      }
    }
  });
  const results = computed(() => {
    const page = catalogPage.value;
    return page && { items: page.items.filter(item => !withdrawn.has(item.trip_id)), next_cursor: page.next_cursor };
  });
  const listLoading = computed(() => !results.value && (pending.value || !status.value));
  const detail = usePublicResource('public-catalog-detail', async (signal) => {
    const id = expandedId.value;
    if (!id) {
      return null;
    }
    if (!isResourceId(id)) {
      throw createError({ statusCode: 404 });
    }
    try {
      const published = await readTrip(id, signal);
      signal.throwIfAborted();
      if (withdrawn.has(id) && catalogVisited.value && import.meta.client) {
        refresh();
      }
      return published;
    }
    catch (error) {
      signal.throwIfAborted();
      if (id === expandedId.value && [403, 404, 410].includes(readFailureStatus(error))) {
        const alreadyWithdrawn = withdrawn.has(id);
        withdrawn.set(id, ++accessCheck);
        if (catalogVisited.value && !alreadyWithdrawn && import.meta.client) {
          refresh();
        }
      }
      throw error;
    }
  });
  const expandedTrip = computed(() => detail.value.value?.trip_id === expandedId.value ? detail.value.value : null);

  watch(expandedId, (id) => {
    detail.clear();
    if (id) {
      detail.refresh();
    }
    else if (!catalogVisited.value) {
      catalogVisited.value = true;
      refresh();
    }
  });
  const filterKey = computed(() => JSON.stringify([filters.value, near.value, route.query.radius_km]));
  watch(filterKey, () => {
    clear();
    refresh();
  });

  return {
    expandedId,
    expandedTrip,
    catalogVisited,
    filters,
    near,
    showNearbyNotice,
    screens,
    filterKey,
    detail,
    results,
    listLoading,
    ready,
    refresh,
    status,
    pending,
    nextError,
    more,
    loadingNext,
  };
}
