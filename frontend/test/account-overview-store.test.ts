import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import {
  effectScope,
  nextTick,
  ref,
} from 'vue';
import { createAccountOverviewStore } from '../src/entities/traveler/model/use-account-overview';
import {
  identityApi,
  IdentityResponseError,
} from '../src/shared/api';
import type { AccountOverview } from '../src/shared/api';

vi.mock('@fsd/shared/api', () => import('../src/shared/api'));
vi.mock('@fsd/shared/session', () => import('../src/shared/session'));

const first = 'a8a0d384-85b4-40fc-b77a-c0db34686a15';
const second = '0672d20f-93b4-4c8b-8d0d-e94200d97bf2';

function summary(id: string): AccountOverview {
  return {
    viewer_id: id,
    rating: { average: null, count: 0 },
    level: { code: 'novice', completed: 0, next_at: 3 },
    trips: {
      created: 0,
      planned: 0,
      in_progress: 0,
      completed: 0,
      archived: 0,
    },
    achievements: [],
  };
}

function setup() {
  const viewer = ref<string | undefined>(first);
  const recover = vi.fn(() => {
    viewer.value = undefined;
  });
  const scope = effectScope();
  const changes = new EventTarget();
  const store = scope.run(() => createAccountOverviewStore(() => viewer.value, recover, changes))!;
  const read = vi.spyOn(identityApi, 'overview').mockImplementation(async () => summary(viewer.value!));
  return {
    changes,
    viewer,
    recover,
    scope,
    store,
    read,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('deduplicates consumers, reuses the result and discards it on logout even for the same next account', async () => {
  const { viewer, scope, store, read } = setup();
  await Promise.all([store.load(), store.load()]);
  await store.load();
  expect(read).toHaveBeenCalledTimes(1);
  expect(store.overview.value?.viewer_id).toBe(first);
  viewer.value = undefined;
  expect(store.overview.value).toBeUndefined();
  await store.load();
  viewer.value = first;
  await store.load();
  expect(read).toHaveBeenCalledTimes(2);
  scope.stop();
});

it('cannot apply a delayed result after switching accounts', async () => {
  const { viewer, scope, store, read } = setup();
  const delayed = Promise.withResolvers<AccountOverview>();
  read.mockReturnValueOnce(delayed.promise);
  const loading = store.load();
  viewer.value = second;
  await store.load();
  expect(read.mock.calls[0]![0].aborted).toBe(true);
  delayed.resolve(summary(first));
  await loading;
  expect(store.overview.value?.viewer_id).toBe(second);
  scope.stop();
});

it('remembers a read error until explicit retry and clears the account on a confirmed 401', async () => {
  const { scope, store, read, recover } = setup();
  read.mockRejectedValueOnce(new IdentityResponseError(503, 'DEPENDENCY_UNAVAILABLE'));
  await store.load();
  await store.load();
  expect(store.error.value).toBe(503);
  expect(read).toHaveBeenCalledTimes(1);
  read.mockRejectedValueOnce(new IdentityResponseError(401, 'SESSION_REQUIRED'));
  await store.load(true);
  expect(recover).toHaveBeenCalledOnce();
  expect(store.overview.value).toBeUndefined();
  expect(store.error.value).toBeUndefined();
  scope.stop();
});

it('refreshes visible consumers together after a mutation and defers a hidden consumer until its next opening', async () => {
  const { scope, store, changes, read } = setup();
  const expanded = ref(false);
  scope.run(() => {
    store.observe(expanded);
    store.observe(expanded);
  });
  changes.dispatchEvent(new Event('overview-changed'));
  await nextTick();
  expect(read).not.toHaveBeenCalled();
  expanded.value = true;
  await vi.waitFor(() => expect(store.overview.value?.trips.created).toBe(0));
  const afterCreation = summary(first);
  afterCreation.trips.created = 1;
  read.mockResolvedValue(afterCreation);
  changes.dispatchEvent(new Event('overview-invalidated'));
  await vi.waitFor(() => expect(store.overview.value?.trips.created).toBe(1));
  expect(read).toHaveBeenCalledTimes(2);
  expanded.value = false;
  changes.dispatchEvent(new Event('overview-changed'));
  await nextTick();
  expect(read).toHaveBeenCalledTimes(2);
  expanded.value = true;
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  scope.stop();
});
