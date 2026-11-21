import type { CatalogFilterOptions } from '@fsd/shared/api';

export function useCatalogDictionaries() {
  const { data, status, pending, error, refresh } = useFetch<CatalogFilterOptions>('/api/v1/catalog/filter-options', {
    server: false,
    immediate: false,
    deep: false,
    credentials: 'omit',
    retry: 0,
  });
  return {
    regions: computed(() => data.value?.regions ?? []),
    difficulties: computed(() => data.value?.difficulties ?? []),
    pending,
    error,
    refresh,
    load() {
      if (status.value === 'idle') {
        void refresh();
      }
    },
  };
}
