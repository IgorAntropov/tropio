import {
  effectScope,
  ref,
  shallowRef,
} from 'vue';
import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import { useCatalogPages } from '../src/pages/public-catalog/model/use-catalog-pages';

vi.mock('@fsd/shared/api', () => import('../src/shared/api'));
vi.mock('../src/pages/public-catalog/model/use-public-resource', () => ({
  usePublicResource: (_key: string, load: (signal: AbortSignal) => Promise<unknown>) => {
    const value = shallowRef();
    return {
      value,
      pending: ref(false),
      refresh: async () => {
        value.value = await load(new AbortController().signal);
      },
      clear: () => {
        value.value = undefined;
      },
    };
  },
}));

afterEach(() => vi.unstubAllGlobals());

it('rebuilds a returning list from currently visible trips and continues after the restored prefix', async () => {
  const scope = effectScope();
  const request = vi.fn();
  vi.stubGlobal('$fetch', request);
  try {
    const items = Array.from({ length: 24 }, (_, index) => ({ trip_id: 'visible-' + index }));
    request.mockResolvedValueOnce({ items, next_cursor: 'after-restoration' });
    const pages = scope.run(() => useCatalogPages(() => true, () => ({ q: 'лес' }), async () => [], () => 2))!;
    await pages.refresh();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![1].query).toEqual({ q: 'лес', limit: 24, cursor: undefined });
    expect(pages.value.value?.items).toEqual(items);
    expect(pages.value.value?.depth).toBe(2);

    request.mockResolvedValueOnce({ items: [{ trip_id: 'new' }], next_cursor: null });
    await pages.more();
    expect(request.mock.calls[1]![1].query).toEqual({ q: 'лес', limit: 12, cursor: 'after-restoration' });
    expect(pages.value.value?.items.at(-1)).toEqual({ trip_id: 'new' });
  }
  finally {
    scope.stop();
  }
});

it('appends only the next cursor and keeps the verified prefix when rechecking later pages fails', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('$fetch', fetch);
  const scope = effectScope();
  try {
    const pages = scope.run(() => useCatalogPages(() => true, () => ({}), async () => []))!;
    const first = { items: [{ trip_id: 'first' }], next_cursor: 'following' };
    fetch.mockResolvedValueOnce(first);
    await pages.refresh();
    fetch.mockResolvedValueOnce({ items: [{ trip_id: 'first' }, { trip_id: 'second' }], next_cursor: null });
    await pages.more();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1].query.cursor).toBe('following');
    expect(pages.value.value?.items.map(item => item.trip_id)).toEqual(['first', 'second']);

    fetch.mockResolvedValueOnce(first).mockRejectedValueOnce({ status: 503 });
    await pages.refresh();
    expect(pages.nextError.value).toBe(503);
    expect(pages.value.value?.items).toEqual(first.items);
    expect(pages.value.value?.next_cursor).toBe('following');

    fetch.mockResolvedValueOnce({ ...first, next_cursor: null });
    await pages.refresh();
    expect(pages.nextError.value).toBeUndefined();
    expect(pages.value.value?.next_cursor).toBeNull();
  }
  finally {
    scope.stop();
  }
});
