import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
} from 'vue';
import type {
  CatalogQuery,
  PublicTripPage,
} from '@fsd/shared/api';
import { readFailureStatus } from '@fsd/shared/api';
import { usePublicResource } from './use-public-resource';

type CatalogPage = PublicTripPage & { verified: [string, number][]; depth: number; continuationError?: number };

export function useCatalogPages(
  enabled: () => boolean,
  query: () => CatalogQuery,
  verify: (items: PublicTripPage['items'], signal: AbortSignal) => Promise<[string, number][]>,
) {
  const loadingNext = ref(false);
  const appendError = ref<number>();
  const extension = shallowRef<{ base: CatalogPage; page: CatalogPage }>();
  let request: AbortController | undefined;
  let pageCount = 1;

  function cancelNext() {
    request?.abort();
    request = undefined;
    loadingNext.value = false;
  }

  async function fetchPage(params: CatalogQuery, cursor: string | null, signal: AbortSignal) {
    const page = await $fetch<PublicTripPage>('/api/v1/catalog/trips', {
      query: { ...params, limit: 12, cursor: cursor ?? undefined },
      credentials: 'omit',
      cache: 'no-store',
      retry: 0,
      signal,
    });
    signal.throwIfAborted();
    if (cursor && page.next_cursor === cursor) {
      throw createError({ statusCode: 502 });
    }
    return page;
  }

  const base = usePublicResource('public-catalog', async (signal): Promise<CatalogPage> => {
    cancelNext();
    if (!enabled()) {
      return {
        items: [],
        next_cursor: null,
        verified: [],
        depth: 0,
      };
    }
    const params = query();
    const byId = new Map<string, PublicTripPage['items'][number]>();
    let cursor: string | null = null;
    let depth = 0;
    let continuationError: number | undefined;
    for (let index = 0; index < pageCount; index++) {
      let page: PublicTripPage;
      try {
        page = await fetchPage(params, cursor, signal);
      }
      catch (error) {
        signal.throwIfAborted();
        if (!cursor) {
          throw error;
        }
        continuationError = readFailureStatus(error);
        break;
      }
      depth++;
      for (const item of page.items) {
        byId.set(item.trip_id, item);
      }
      cursor = page.next_cursor;
      if (!cursor) {
        break;
      }
    }
    const items = Array.from(byId.values());
    return {
      items,
      next_cursor: cursor,
      verified: await verify(items, signal),
      depth,
      continuationError,
    };
  });
  const value = computed(() => extension.value && extension.value.base === base.value.value
    ? extension.value.page
    : base.value.value);
  const nextError = computed(() => value.value?.next_cursor && !loadingNext.value ? appendError.value ?? value.value.continuationError : undefined);
  watch(base.value, (page) => {
    extension.value = undefined;
    appendError.value = undefined;
    if (page) {
      pageCount = Math.max(1, page.depth);
    }
  }, { flush: 'sync' });

  async function more() {
    const first = base.value.value;
    const previous = value.value;
    if (!first || !previous?.next_cursor || base.pending.value || loadingNext.value) {
      return;
    }
    const controller = new AbortController();
    request = controller;
    loadingNext.value = true;
    appendError.value = undefined;
    try {
      const page = await fetchPage(query(), previous.next_cursor, controller.signal);
      const verified = await verify(page.items, controller.signal);
      controller.signal.throwIfAborted();
      if (first !== base.value.value) {
        return;
      }
      const seen = new Set(previous.items.map(item => item.trip_id));
      extension.value = { base: first, page: {
        items: [...previous.items, ...page.items.filter(item => !seen.has(item.trip_id))],
        next_cursor: page.next_cursor,
        verified,
        depth: previous.depth + 1,
      } };
      pageCount = previous.depth + 1;
    }
    catch (error) {
      if (!controller.signal.aborted) {
        appendError.value = readFailureStatus(error);
      }
    }
    finally {
      if (request === controller) {
        request = undefined;
        loadingNext.value = false;
      }
    }
  }

  function clear() {
    cancelNext();
    pageCount = 1;
    appendError.value = undefined;
    base.clear();
  }
  onScopeDispose(cancelNext);
  return {
    ...base,
    value,
    clear,
    loadingNext,
    nextError,
    more,
  };
}
