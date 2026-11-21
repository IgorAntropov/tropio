<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { useTripCreation } from '@fsd/features/trip-draft-dialog';
import {
  editorApi,
  EditorResponseError,
  identityApi,
  IdentityResponseError,
  readFailureStatus,
} from '@fsd/shared/api';
import type {
  AccountTripCollection,
  AccountTripPage,
  AccountTripStatus,
} from '@fsd/shared/api';
import {
  workspaceMemberKey,
  workspaceReloadNoticeKey,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';
import {
  UiScrollPagination,
  UiSearchField,
  UiSelect,
  UiSkeleton,
} from '@fsd/shared/ui/kit';
import { SystemErrorState } from '@fsd/shared/ui/page-error';
import { WorkspacePage } from '@fsd/shared/ui/workspace-page/index';
import {
  collectionFilters,
  collections,
  statuses,
} from '../model/collection';
import AccountTripCard from './AccountTripCard.vue';
import '@fsd/shared/ui/kit/kit.css';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
const notice = useState<string | null>(workspaceReloadNoticeKey, () => null);
const creating = useTripCreation();
const applied = computed(() => collectionFilters(route.query));
const search = ref(applied.value.query);
const filterOptions = computed(() => {
  const { collection, status } = applied.value;
  const options = [
    { value: 'all', label: t('accountTrips.filters.all') },
    ...collections.map(value => ({ value, label: t('accountTrips.collections.' + value) })),
    ...statuses.map(value => ({ value, label: t('accountTrips.filters.' + value) })),
  ];
  if (collection !== 'all' && status !== 'all') {
    options.push({ value: collection + ':' + status, label: t('accountTrips.collections.' + collection) + ' · ' + t('accountTrips.filters.' + status) });
  }
  return options;
});
const grid = ref<{ $el: HTMLElement }>();
const toolbar = ref<HTMLElement>();
const scrollPanel = computed(() => toolbar.value?.closest<HTMLElement>('.workspace-page-panel'));
const announcement = ref('');
const result = shallowRef<AccountTripPage | null>(null);
const loading = ref(true);
const loadingMore = ref(false);
const issue = ref<number>();
let request: AbortController | undefined;

function update(collection: AccountTripCollection, status: AccountTripStatus, query: string) {
  void router.replace({
    path: '/trips',
    query: {
      collection: collection === 'all' ? undefined : collection,
      status: status === 'all' ? undefined : status,
      query: query.trim() || undefined,
    },
  });
}

const filter = computed<readonly string[]>({
  get() {
    const { collection, status } = applied.value;
    if (collection !== 'all' && status !== 'all') {
      return [collection + ':' + status];
    }
    return [collection === 'all' ? status : collection];
  },
  set([value]) {
    const collection = collections.find(option => option === value) ?? 'all';
    const status = statuses.find(option => option === value) ?? 'all';
    if (value === 'all' || collection !== 'all' || status !== 'all') {
      update(collection, status, search.value);
    }
  },
});
const errorDescription = computed(() => {
  if (issue.value === 400) {
    return t('accountTrips.invalidHint');
  }
  if (issue.value === 429) {
    return t('errors.rateLimitedHint');
  }
  if (issue.value === 403 || issue.value === 404 || issue.value === 410) {
    return t('accountTrips.accessHint');
  }
  return t('accountTrips.unavailableHint');
});
const filtered = computed(() => !!applied.value.query || applied.value.status !== 'all' || applied.value.collection !== 'all');

function resetSearch() {
  search.value = '';
  const refresh = !filtered.value;
  update('all', 'all', '');
  if (refresh) {
    void load();
  }
}

function changedSession() {
  result.value = null;
  notice.value = t('tripDrafts.accountChanged');
  window.location.reload();
}

async function load(append = false) {
  if (append && (!result.value?.next_cursor || loadingMore.value)) {
    return;
  }
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const { signal } = controller;
  const cursor = append ? result.value?.next_cursor : undefined;
  const filters = applied.value;
  if (!append) {
    result.value = null;
  }
  issue.value = undefined;
  loading.value = !append;
  loadingMore.value = append;
  try {
    const page = await editorApi.listAccountTrips({
      collection: filters.collection,
      status: filters.status,
      query: filters.query || undefined,
      limit: 12,
      cursor: cursor || undefined,
    }, signal);
    const owner = await identityApi.me(signal);
    signal.throwIfAborted();
    if (page.viewer_id !== owner.id || (member.value && member.value.id !== owner.id)) {
      changedSession();
      return;
    }
    const previous = append ? result.value?.items ?? [] : [];
    const ids = new Set(previous.map(trip => trip.trip_id));
    if (cursor && page.next_cursor === cursor) {
      throw new EditorResponseError(502, null);
    }
    result.value = { ...page, items: [...previous, ...page.items.filter(trip => !ids.has(trip.trip_id))] };
  }
  catch (error) {
    if (!signal.aborted) {
      if ((error instanceof EditorResponseError || error instanceof IdentityResponseError) && error.status === 401) {
        changedSession();
      }
      else {
        issue.value = readFailureStatus(error);
      }
    }
  }
  finally {
    if (!signal.aborted) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function placeLeavingCard(el: Element) {
  if (el instanceof HTMLElement) {
    const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = el;
    Object.assign(el.style, {
      left: offsetLeft + 'px',
      top: offsetTop + 'px',
      width: offsetWidth + 'px',
      height: offsetHeight + 'px',
    });
    el.inert = true;
  }
}

async function favoriteChanged(tripId: string, saved: boolean) {
  const page = result.value;
  const index = page?.items.findIndex(trip => trip.trip_id === tripId) ?? -1;
  const trip = page?.items[index];
  if (!page || !trip) {
    return;
  }
  const remove = !saved && (applied.value.collection === 'favorites' || (!trip.is_owner && !trip.participation_status));
  const row = grid.value?.$el.children[index];
  const focusMoved = row?.contains(document.activeElement);
  const items = remove
    ? page.items.filter(item => item.trip_id !== tripId)
    : page.items.map(item => item.trip_id === tripId ? { ...item, saved } : item);
  result.value = { ...page, items };
  if (!saved) {
    announcement.value = t('accountTrips.removedFavorite', { title: trip.title });
  }
  if (focusMoved) {
    await nextTick();
    const nextTrip = items[Math.min(index, items.length - 1)];
    const link = nextTrip && grid.value?.$el.querySelector<HTMLElement>('[data-trip="' + nextTrip.trip_id + '"] h2 a');
    (link ?? toolbar.value?.querySelector<HTMLElement>('.tk-select-trigger'))?.focus({ preventScroll: true });
  }
  if (!items.length && page.next_cursor) {
    void load(true);
  }
}

function visibilityChanged() {
  if (document.hidden) {
    request?.abort();
    result.value = null;
    loading.value = true;
  }
  else {
    void load();
  }
}

onMounted(() => {
  watch([() => applied.value.collection, () => applied.value.status, () => applied.value.query, () => member.value?.id], () => {
    search.value = applied.value.query;
    if (!document.hidden) {
      void load();
    }
  }, { immediate: true });
  watch(() => route.query.new, (value) => {
    if (value === '1' && route.path === '/trips') {
      creating.value = true;
      const query = { ...route.query };
      delete query.new;
      void router.replace({ path: route.path, query });
    }
  }, { immediate: true });
  document.addEventListener('visibilitychange', visibilityChanged);
});
onBeforeUnmount(() => {
  request?.abort();
  if (import.meta.client) {
    document.removeEventListener('visibilitychange', visibilityChanged);
  }
});
</script>

<template>
  <WorkspacePage class="account-trips-page">
    <section :aria-label="t('workspace.trips')" class="account-trips">
      <header ref="toolbar" class="account-trips-toolbar">
        <div class="account-trips-find">
          <form role="search" @submit.prevent="update(applied.collection, applied.status, search)">
            <UiSearchField
              v-model="search"
              :label="t('accountTrips.search')"
              :maxlength="120"
              name="query"
              :submit-label="t('catalog.find')"
            />
          </form>
          <UiSelect
            v-model="filter"
            :label="t('accountTrips.collection')"
            label-hidden
            :options="filterOptions"
          />
        </div>
      </header>
      <div class="account-trips-results">
        <span class="tk-sr-only" role="status">{{ announcement }}</span>
        <template v-if="loading">
          <span class="tk-sr-only" role="status">{{ t('accountTrips.loading') }}</span>
          <div aria-hidden="true" class="account-trips-grid">
            <div v-for="slot in 8" :key="slot" class="account-card-skeleton">
              <UiSkeleton class="account-skeleton-cover" />
              <div><UiSkeleton /><UiSkeleton /><UiSkeleton /></div>
            </div>
          </div>
        </template>
        <template v-else>
          <TransitionGroup
            v-if="result"
            ref="grid"
            class="account-trips-grid"
            name="account-trip"
            tag="ul"
            @before-leave="placeLeavingCard"
          >
            <li v-for="trip in result.items" :key="trip.trip_id" :data-trip="trip.trip_id">
              <AccountTripCard
                :member="member"
                :return-to="route.fullPath"
                :trip="trip"
                @favorite="favoriteChanged(trip.trip_id, $event)"
              />
            </li>
          </TransitionGroup>
          <div v-if="!result?.items.length && !issue" class="account-trips-empty">
            <p role="status">{{ t(applied.query || applied.status !== 'all' ? 'accountTrips.noMatches' : 'accountTrips.empty.' + applied.collection) }}</p>
            <button
              v-if="filtered"
              class="tk-button"
              type="button"
              @click="resetSearch"
            >{{ t('accountTrips.reset') }}</button>
          </div>
          <SystemErrorState
            v-if="issue"
            :class="result?.items.length ? 'account-trips-more-issue' : 'account-trips-read-issue'"
            compact
            :description="errorDescription"
            :status-code="issue"
            :title="issue === 400 ? t('catalog.invalid') : t(result?.items.length ? 'accountTrips.moreError' : 'accountTrips.loadError')"
          >
            <button
              v-if="issue === 400"
              class="tk-button tk-button-primary"
              type="button"
              @click="resetSearch"
            >{{ t('accountTrips.reset') }}</button>
            <button
              v-else
              class="tk-button tk-button-primary"
              type="button"
              @click="load(!!result?.next_cursor)"
            >{{ t('catalog.retry') }}</button>
          </SystemErrorState>
          <UiScrollPagination
            v-else-if="result?.next_cursor"
            :cursor="result.next_cursor"
            :loading="loadingMore"
            :root="scrollPanel"
            @more="load(true)"
          />
        </template>
      </div>
    </section>
  </WorkspacePage>
</template>

<style scoped>
.account-trips { --account-cover-ratio: 2.65; display: flex; flex-direction: column; min-block-size: 100%; container-type: inline-size; }
.account-trips-toolbar { position: sticky; z-index: 4; inset-block-start: 0; display: grid; gap: var(--tk-space-3); padding: var(--tk-space-4); border-block-end: 1px solid var(--tk-line); background: var(--tk-surface); }
.account-trips-find { display: grid; grid-template-columns: minmax(0, 1fr) minmax(10rem, 14rem); align-items: end; gap: var(--tk-space-2); }
.account-trips-find > *, .account-trips-find :deep(.tk-select-anchor) { min-inline-size: 0; }
.account-trips-find :deep(.tk-select-trigger) { min-height: var(--tk-target); }
.account-trips-results { display: flex; flex: 1; flex-direction: column; padding: var(--tk-space-4); }
.account-trips-grid { position: relative; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18.5rem), 1fr)); gap: var(--tk-space-4); margin: 0; padding: 0; list-style: none; }
.account-trips-grid > li { display: grid; min-inline-size: 0; }
.account-trips-empty { display: flex; align-items: center; justify-content: center; gap: var(--tk-space-3); text-align: center; }
.account-trips-empty { flex: 1; flex-direction: column; min-block-size: 10rem; color: var(--tk-muted); }
.account-trips-empty p { margin: 0; }
.account-trips-results .account-trips-more-issue { margin-block-start: var(--tk-space-4); }
.account-card-skeleton { overflow: hidden; border: 1px solid var(--tk-line); border-radius: var(--tk-radius); background: var(--tk-surface); }
.account-skeleton-cover { height: auto; aspect-ratio: var(--account-cover-ratio); border-radius: 0; }
.account-card-skeleton > div { display: grid; align-content: space-between; min-block-size: calc(2 * var(--tk-target) + 2rem); gap: var(--tk-space-2); padding: var(--tk-space-3); }
.account-card-skeleton > div > :nth-child(1) { width: 72%; height: 1.4rem; }
.account-card-skeleton > div > :nth-child(2) { width: 52%; }
.account-card-skeleton > div > :nth-child(3) { width: 36%; }
.account-trip-leave-active { position: absolute; pointer-events: none; }
@media (prefers-reduced-motion: no-preference) {
  .account-trip-move { transition: transform 260ms ease; }
  .account-trip-enter-active, .account-trip-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
  .account-trip-enter-from, .account-trip-leave-to { opacity: 0; transform: translateY(.35rem) scale(.98); }
}
@container (max-width: 28rem) {
  .account-trips-toolbar, .account-trips-results { padding: var(--tk-space-3); }
  .account-trips-find { grid-template-columns: minmax(0, 1fr) minmax(0, 42%); }
}
@container (max-width: 21rem) {
  .account-trips-find { grid-template-columns: minmax(0, 1fr); }
}
</style>
