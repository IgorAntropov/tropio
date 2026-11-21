<script setup lang="ts">
import {
  TripCard,
  tripTypeIcons,
  useTripRoute,
} from '@fsd/entities/public-trip';
import {
  provideTripParticipation,
  TripParticipationAction,
} from '@fsd/features/trip-participation';
import type {
  PublicTrip,
  PublicTripPage,
} from '@fsd/shared/api';
import {
  isResourceId,
  readFailureStatus,
} from '@fsd/shared/api';
import { RouteMap } from '@fsd/shared/map';
import type { MapSelection } from '@fsd/shared/map';
import { UiDateRange } from '@fsd/shared/ui/date-range';
import {
  UiDialog,
  UiSegmented,
  UiSelect,
  UiTextField,
} from '@fsd/shared/ui/kit';
import { catalogFilters } from '../model/catalog';
import { useCatalogScreens } from '../model/use-catalog-screens';
import { useCatalogExpansion } from '../model/use-catalog-expansion';
import { useCatalogDictionaries } from '../model/use-catalog-dictionaries';
import { useCatalogLocation } from '../model/use-catalog-location';
import { usePublicResource } from '../model/use-public-resource';
import CatalogFrame from './CatalogFrame.vue';
import PublicReadIssue from './PublicReadIssue.vue';
import PublicTripPageView from './PublicTripPage.vue';

defineProps<{ sessionConfirmed: boolean | null }>();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig().public;
const expandedId = computed(() => typeof route.params.tripId === 'string' ? route.params.tripId.toLowerCase() : '');
const catalogVisited = ref(!expandedId.value);
const filters = computed(() => catalogFilters(route.query));
const query = ref(filters.value.q ?? '');
const pages = ref(1);
const filterOpen = ref(false);
const filterMounted = ref(false);
const filterButton = ref<HTMLButtonElement>();
const { regions, difficulties, pending: dictionariesPending, error: dictionariesError, refresh: refreshDictionaries } = useCatalogDictionaries();
const { near, located, locating, issue: locationIssue, locate, cancel: cancelLocation } = useCatalogLocation(
  () => catalogVisited.value && !expandedId.value && !route.query.bbox && !route.query.region && route.query.area !== 'all' && !filterOpen.value,
);
const nearby = ref(false);
const radius = ref<readonly string[]>([]);
const radiusOptions = ['', '5', '25', '100'].map(value => ({ value, label: value ? t('catalog.radiusKm', { value }) : t('catalog.noRadius') }));
const start = ref('');
const end = ref('');
const difficulty = ref<readonly string[]>([]);
const region = ref<readonly string[]>([]);
const datesInvalid = computed(() => !!(start.value && end.value && start.value > end.value));
const { mobile, mode, routeMap, dayNumber, open: openScreen, back } = useCatalogScreens(expandedId);
const showNearbyNotice = computed(() => !!near.value && !filters.value.bbox && !filters.value.region);
const selectedTypes = ref<readonly string[]>([]);
const typeOptions = Object.entries(tripTypeIcons).map(([value, icon]) => ({ value, icon, label: t('catalog.types.' + value) }));
const viewOptions = [{ value: 'map', label: t('catalog.map') }, { value: 'list', label: t('catalog.list') }];
const legacyBounds = 'bbox';
const regionOptions = computed(() => [
  { value: '', label: t('catalog.allRegions') },
  ...(filters.value.bbox ? [{ value: legacyBounds, label: t('catalog.linkBounds') }] : []),
  ...regions.value,
]);
const difficultyOptions = computed(() => [{ value: '', label: t('catalog.allLevels') }, ...difficulties.value]);
const selectedDifficulty = computed({
  get() {
    const value = difficulty.value[0] ?? '';
    const option = difficultyOptions.value.find(item => item.value === value || item.label.toLocaleLowerCase('ru') === value.toLocaleLowerCase('ru'));
    return [option?.value ?? value];
  },
  set(value: readonly string[]) {
    difficulty.value = value;
  },
});
const filtersActive = computed(() => Boolean(near.value || Object.keys(filters.value).some(key => key !== 'q')));

async function setFilters(patch: Record<string, string>) {
  const next = Object.fromEntries(Object.entries({ ...route.query, ...patch }).filter(([, value]) => value !== ''));
  await router.replace({ path: '/catalog', query: next });
}
function openFilters() {
  cancelLocation();
  selectedTypes.value = (filters.value.trip_type ?? '').split(',').filter(value => Object.hasOwn(tripTypeIcons, value));
  start.value = filters.value.start_date ?? '';
  end.value = filters.value.end_date ?? '';
  difficulty.value = [filters.value.difficulty ?? ''];
  region.value = [filters.value.region ?? (filters.value.bbox ? legacyBounds : '')];
  nearby.value = !!near.value;
  radius.value = [typeof route.query.radius_km === 'string' ? route.query.radius_km : ''];
  locationIssue.value = false;
  filterMounted.value = true;
  filterOpen.value = true;
}
async function chooseNearby() {
  if (nearby.value) {
    nearby.value = false;
    return;
  }
  if (await locate() && filterOpen.value) {
    nearby.value = true;
    region.value = [];
  }
}
function chooseRegion(value: readonly string[]) {
  cancelLocation();
  locationIssue.value = false;
  nearby.value = false;
  region.value = value;
}
async function applyFilters() {
  if (datesInvalid.value || locating.value) {
    return;
  }
  near.value = nearby.value ? located.value : undefined;
  await setFilters({
    trip_type: selectedTypes.value.join(','),
    start_date: start.value,
    end_date: end.value,
    difficulty: selectedDifficulty.value[0] ?? '',
    bbox: !nearby.value && region.value[0] === legacyBounds ? filters.value.bbox ?? '' : '',
    region: !nearby.value && region.value[0] !== legacyBounds ? region.value[0] ?? '' : '',
    area: nearby.value ? 'near' : region.value[0] ? '' : 'all',
    radius_km: nearby.value ? radius.value[0] ?? '' : '',
  });
  filterOpen.value = false;
}
function resetDraft() {
  cancelLocation();
  selectedTypes.value = [];
  start.value = '';
  end.value = '';
  difficulty.value = [];
  nearby.value = false;
  radius.value = [];
  region.value = [''];
  locationIssue.value = false;
}
function filtersClosed() {
  if (filterOpen.value) {
    return;
  }
  cancelLocation();
  filterMounted.value = false;
  filterButton.value?.focus({ preventScroll: true });
}
function resetFilters() {
  cancelLocation();
  near.value = undefined;
  filterOpen.value = false;
  void router.replace({ query: mode.value === 'list' ? { view: 'list' } : {} });
}
const selected = ref('');
const focus = ref<{ kind: 'point'; id: string; request: number } | null>(null);
const withdrawn = reactive(new Map<string, number>());
let accessCheck = 0;
const board = ref<HTMLElement>();
const sidebar = ref<HTMLElement>();
const list = computed(() => mode.value === 'list' ? board.value : sidebar.value);
const mapElement = ref<HTMLElement>();
const mapReady = ref(false);
const flyFromCatalog = ref(false);
const detailLeaving = ref(false);
const { stage, remember, close: closeDetail, animate, restore, forgetLink } = useCatalogExpansion(expandedId, selected, list, mobile, back);
function enterDetail(element: Element, done: () => void) {
  detailLeaving.value = false;
  animate(element, done, true);
}
function leaveDetail(element: Element, done: () => void) {
  detailLeaving.value = true;
  animate(element, done, false);
}
function afterLeave() {
  detailLeaving.value = false;
  void restore();
}
function readTrip(id: string, signal: AbortSignal) {
  return $fetch<PublicTrip>('/api/v1/catalog/trips/' + encodeURIComponent(id), {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    retry: 0,
  });
}
const { value: catalogPage, status, pending, clear, refresh, ready } = usePublicResource('public-catalog', async (signal) => {
  const verified: [string, number][] = [];
  if (!catalogVisited.value) {
    return { items: [], next_cursor: null, verified };
  }
  const params = { ...filters.value };
  if (near.value && !params.bbox && !params.region) {
    params.near = near.value;
    if (typeof route.query.radius_km === 'string') {
      params.radius_km = route.query.radius_km;
    }
  }
  const items: PublicTripPage['items'] = [];
  let cursor: string | null = null;
  for (let page = 0; page < pages.value; page++) {
    const result: PublicTripPage = await $fetch<PublicTripPage>('/api/v1/catalog/trips', {
      query: { ...params, limit: 24, ...(cursor ? { cursor } : {}) },
      cache: 'no-store',
      credentials: 'omit',
      retry: 0,
      signal,
    });
    items.push(...result.items);
    cursor = result.next_cursor;
    if (!cursor) {
      break;
    }
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
  return { items: Array.from(unique.values()), next_cursor: cursor, verified };
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
      if (selected.value === id) {
        selected.value = '';
      }
      if (focus.value?.id === id) {
        focus.value = null;
      }
      forgetLink();
      if (catalogVisited.value && !alreadyWithdrawn && import.meta.client) {
        refresh();
      }
    }
    throw error;
  }
});
const expandedTrip = computed(() => detail.value.value?.trip_id === expandedId.value ? detail.value.value : null);
const { day, segment, points: routePoints, tracks, pois, selection, focus: routeFocus, select } = useTripRoute(expandedTrip);
const detailUnavailable = computed(() => Boolean(detail.status.value && detail.status.value !== 200));
const routeScreen = computed(() => routeMap.value && !detailUnavailable.value);
const displayedDay = computed(() => {
  const days = expandedTrip.value?.days;
  return days?.find(item => item.position === dayNumber.value) ?? days?.[0];
});
watch([routeMap, displayedDay, () => expandedTrip.value?.publication_id], () => {
  if (routeMap.value && displayedDay.value) {
    day.value = displayedDay.value.position;
    segment.value = '';
  }
}, { immediate: true });
const routeTitle = ref<HTMLButtonElement>();
const legendInset = ref<number>();
const routeBottomInset = ref<number>();
watch([routeTitle, mapReady, mapElement], ([button, ready, element], _previous, onCleanup) => {
  legendInset.value = undefined;
  routeBottomInset.value = undefined;
  if (!button || !ready || !element) {
    return;
  }
  const controls = element.querySelectorAll<HTMLElement>('.maplibregl-ctrl-bottom-left > .maplibregl-ctrl, .maplibregl-ctrl-bottom-right > .maplibregl-ctrl');
  const measure = () => {
    const bottom = element.getBoundingClientRect().bottom;
    legendInset.value = Math.ceil(Math.max(0, ...Array.from(controls, control => bottom - control.getBoundingClientRect().top)));
    routeBottomInset.value = Math.ceil(bottom - button.getBoundingClientRect().top);
  };
  const observer = new ResizeObserver(measure);
  controls.forEach(control => observer.observe(control));
  observer.observe(element);
  observer.observe(button);
  if (button.parentElement) {
    observer.observe(button.parentElement);
  }
  measure();
  onCleanup(() => observer.disconnect());
}, { flush: 'post' });
const preview = computed(() => detail.pending.value && !detail.status.value
  ? results.value?.items.find(item => item.trip_id === expandedId.value)
  : undefined);
provideTripParticipation(
  () => expandedId.value ? (expandedTrip.value ? [expandedTrip.value.trip_id] : []) : results.value?.items.map(item => item.trip_id) ?? [],
  () => {
    if (expandedId.value) {
      detail.refresh();
    }
    if (catalogVisited.value) {
      refresh();
    }
  },
);
watch(expandedId, (id, previous) => {
  if (id) {
    flyFromCatalog.value = !previous && catalogVisited.value && mode.value === 'map' && mapReady.value;
  }
  detail.clear();
  if (id) {
    selected.value = id;
    detail.refresh();
  }
  else if (!catalogVisited.value) {
    catalogVisited.value = true;
    refresh();
  }
});
const filterKey = computed(() => JSON.stringify([filters.value, near.value, route.query.radius_km]));
watch(() => [route.query.area, route.query.bbox, route.query.region], ([area, bbox, region]) => {
  if (area === 'all' || bbox || region) {
    near.value = undefined;
  }
});
watch(located, (position) => {
  if (!position) {
    nearby.value = false;
  }
});
watch(filterKey, () => {
  pages.value = 1;
  selected.value = '';
  query.value = filters.value.q ?? '';
  clear();
  refresh();
});
function more() {
  if (pending.value || !results.value?.next_cursor) {
    return;
  }
  pages.value++;
  refresh();
}
const points = computed(() => (results.value?.items ?? []).map(trip => ({ id: trip.trip_id, label: trip.title, position: trip.start })));
const current = computed(() => results.value?.items.find(item => item.trip_id === selected.value) ?? results.value?.items[0]);
const mapVisible = computed(() => expandedId.value
  ? !detailUnavailable.value && (!mobile.value || routeScreen.value)
  : (!mobile.value && detailLeaving.value) || (mode.value === 'map' && !!current.value));
const routeName = computed(() => (expandedTrip.value ?? preview.value)?.title);
const routeDay = computed(() => displayedDay.value?.position ?? dayNumber.value);
function showRoute(id: string) {
  const position = day.value || expandedTrip.value?.days[0]?.position || 1;
  void openScreen(id, position);
}
watch(routeScreen, async (shown) => {
  if (shown) {
    await nextTick();
    routeTitle.value?.focus({ preventScroll: true });
  }
});
watch(expandedId, (id, previous) => {
  if (!id && previous && mobile.value) {
    void restore();
  }
});
const mapFlight = computed(() => {
  if (!expandedId.value) {
    return null;
  }
  const trip = expandedTrip.value ?? preview.value;
  const position = routeScreen.value ? routePoints.value[0]?.position ?? trip?.start : trip?.start;
  const marker = trip && position ? { id: trip.trip_id, label: trip.title, position } : undefined;
  const id = routeScreen.value ? expandedId.value + ':day:' + routeDay.value : expandedId.value;
  return {
    id,
    marker,
    publicationId: expandedTrip.value?.publication_id,
    ready: !!expandedTrip.value,
    animate: flyFromCatalog.value,
    bottomInset: routeScreen.value ? routeBottomInset.value : undefined,
  };
});
const mapSelection = computed<MapSelection | null>(() => expandedId.value ? selection.value : current.value ? { kind: 'point', id: current.value.trip_id } : null);
function selectMapItem(item: MapSelection) {
  if (!expandedId.value && mobile.value) {
    selected.value = item.id;
    forgetLink();
    void openScreen(item.id, 1);
  }
  else if (!expandedId.value) {
    selectMarker(item.id);
  }
  else if (item.kind !== 'point' || item.id !== expandedId.value) {
    select(item);
  }
}
function selectMarker(id: string) {
  selected.value = id;
  const row = list.value?.querySelector<HTMLElement>(`[data-trip="${CSS.escape(id)}"]`);
  if (list.value && row) {
    list.value.scrollTop += row.getBoundingClientRect().top - list.value.getBoundingClientRect().top - 12;
  }
}
async function focusMarker(id: string) {
  if (mobile.value) {
    await openScreen(id, 1);
    return;
  }
  selectMarker(id);
  mapElement.value?.scrollIntoView({ block: 'nearest' });
  focus.value = { kind: 'point', id, request: (focus.value?.request ?? 0) + 1 };
}
const canonical = computed(() => new URL('/catalog' + (expandedId.value ? '/' + encodeURIComponent(expandedId.value) : ''), config.siteUrl).href);
const title = computed(() => expandedId.value ? expandedTrip.value?.title ?? t(detail.status.value === 404 ? 'catalog.unavailableTrip' : 'catalog.short') : t('catalog.title'));
const description = computed(() => expandedId.value
  ? (expandedTrip.value ? expandedTrip.value.description || t('catalog.tripDescription', { title: expandedTrip.value.title }) : undefined)
  : t('catalog.description'));
useSeoMeta({
  title: () => t('pageTitle', { title: title.value }),
  description: () => description.value,
  ogTitle: () => expandedId.value ? expandedTrip.value?.title : title.value,
  ogDescription: () => description.value,
  ogUrl: () => expandedId.value && !expandedTrip.value ? undefined : canonical.value,
  ogImage: () => expandedTrip.value ? new URL('/default-trip-cover.webp', config.siteUrl).href : undefined,
  robots: () => expandedId.value
    ? (expandedTrip.value ? 'index,follow' : 'noindex,nofollow')
    : status.value === 200 && !Object.keys(route.query).length ? 'index,follow' : 'noindex,follow',
});
useHead(() => ({ link: expandedId.value && !expandedTrip.value ? [] : [{ rel: 'canonical', href: canonical.value }] }));
await Promise.all([ready, detail.ready]);
if (import.meta.server) {
  const httpStatus = expandedId.value ? detail.status.value : status.value;
  if (httpStatus !== 200) {
    setResponseStatus(httpStatus ?? 503);
  }
}
</script>

<template>
  <CatalogFrame :session-confirmed="sessionConfirmed">
    <div class="catalog-page" :class="{ 'workspace-page-panel': sessionConfirmed, 'catalog-list-mode': mode === 'list', 'catalog-trip-open': !!expandedId }">
      <h1 v-if="!expandedId" class="tk-sr-only">{{ t('catalog.title') }}</h1>
      <div class="catalog-tools">
        <form class="catalog-search" role="search" @submit.prevent="setFilters({ q: query.trim() })">
          <UiTextField
            v-model="query"
            :label="t('catalog.search')"
            :maxlength="120"
            name="q"
          >
            <template #trailing>
              <button
                :aria-label="t('catalog.find')"
                class="tk-button tk-icon-button catalog-search-submit"
                :title="t('catalog.find')"
                type="submit"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
              </button>
            </template>
          </UiTextField>
        </form>
        <button
          ref="filterButton"
          :aria-expanded="filterOpen"
          aria-haspopup="dialog"
          :aria-label="t('catalog.filters')"
          class="tk-button catalog-filters"
          :class="{ 'catalog-filters-active': filtersActive }"
          :title="t('catalog.filters')"
          type="button"
          @click="openFilters"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" /></svg>
        </button>
      </div>
      <p v-if="showNearbyNotice && mode !== 'list'" class="catalog-location">{{ t('catalog.nearbyActive') }}</p>
      <div
        ref="stage"
        class="catalog-stage"
        :class="{ 'catalog-stage-detail': !!expandedId, 'catalog-stage-route': routeScreen }"
        data-map-frame
      >
        <div
          v-if="catalogVisited"
          ref="board"
          class="catalog-board"
          :inert="!!expandedId || detailLeaving"
          @click.capture="remember"
        >
          <div class="catalog-view" data-map-overlay><UiSegmented
            v-model="mode"
            :glass="mode === 'map'"
            :label="t('catalog.view')"
            :options="viewOptions"
          /></div>
          <p v-if="showNearbyNotice && mode === 'list'" class="catalog-location">{{ t('catalog.nearbyActive') }}</p>
          <template v-if="results && results.items.length">
            <aside ref="sidebar" :aria-label="t('catalog.list')" class="catalog-results">
              <div class="catalog-rows">
                <div
                  v-for="trip in results.items"
                  :key="trip.trip_id"
                  class="catalog-row"
                  :data-trip="trip.trip_id"
                >
                  <TripCard
                    :active="mode === 'map' && current?.trip_id === trip.trip_id"
                    :link-query="route.query"
                    :trip="trip"
                    @locate="focusMarker"
                  >
                    <template #participation><TripParticipationAction :trip="trip" /></template>
                  </TripCard>
                </div>
              </div>
              <button
                v-if="results.next_cursor"
                class="tk-button catalog-more"
                :disabled="pending"
                type="button"
                @click="more"
              >{{ t('catalog.more') }}</button>
            </aside>
          </template>
          <section v-else-if="results" class="catalog-empty">
            <h2>{{ t('catalog.empty') }}</h2><p>{{ t(Object.keys(filters).length ? 'catalog.emptyFilters' : 'catalog.emptyHint') }}</p>
            <button
              v-if="Object.keys(filters).length"
              class="tk-button"
              type="button"
              @click="resetFilters"
            >{{ t('catalog.reset') }}</button>
          </section>
          <PublicReadIssue
            v-else
            :pending="pending"
            :status="status"
            @retry="refresh"
          />
        </div>
        <div
          v-if="mapReady || mapVisible"
          v-show="mapVisible"
          ref="mapElement"
          class="catalog-map"
          :class="{ 'catalog-expanded-map': !!expandedId || detailLeaving }"
        >
          <RouteMap
            cluster-points
            :focus="expandedId ? routeFocus : focus"
            :points="expandedId ? routePoints : points"
            :pois="routeScreen ? [] : pois"
            :route-key="expandedId ? expandedId + ':' + (expandedTrip?.publication_id ?? '') + ':' + day : filterKey"
            :selection="mapSelection"
            :style-url="config.routeMapStyle"
            :tracks="tracks"
            :trip-flight="mapFlight"
            trip-markers
            :unavailable-text="t(expandedId ? 'catalog.detailMapUnavailable' : 'catalog.mapUnavailable')"
            @ready="mapReady = true"
            @select="selectMapItem"
          />
        </div>
        <nav
          v-if="routeScreen"
          :aria-label="t('catalog.routeScheme')"
          class="catalog-route-nav"
          :style="{ '--catalog-legend-inset': legendInset === undefined ? undefined : legendInset + 'px' }"
        >
          <button
            :aria-label="t('catalog.back')"
            class="tk-button tk-icon-button catalog-route-back"
            data-map-overlay
            type="button"
            @click="closeDetail"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="20"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
              viewBox="0 0 24 24"
              width="20"
            ><path d="m14 6-6 6 6 6" /></svg>
          </button>
          <p v-if="expandedTrip && !tracks.length" class="catalog-route-empty" role="status">{{ t('catalog.noRouteGeometry') }}</p>
          <button
            ref="routeTitle"
            :aria-label="routeName && t('catalog.routeDayTitle', { title: routeName, day: routeDay })"
            class="tk-button catalog-route-title"
            data-map-overlay
            type="button"
            @click="openScreen(expandedId)"
          >
            <span class="catalog-route-name">{{ routeName ?? t('catalog.loadingTrip') }}</span>
            <span v-if="routeName" class="catalog-route-day">· {{ t('catalog.day', { day: routeDay }) }}</span>
          </button>
        </nav>
        <Transition
          :css="false"
          @after-leave="afterLeave"
          @enter="enterDetail"
          @leave="leaveDetail"
        >
          <PublicTripPageView
            v-if="expandedId && !routeScreen"
            :key="expandedId"
            v-model:day="day"
            v-model:segment="segment"
            :mobile="mobile"
            :pending="detail.pending.value"
            :preview="preview"
            :status="detail.status.value"
            :trip="expandedTrip"
            @close="closeDetail"
            @retry="detail.refresh"
            @show-map="showRoute(expandedId)"
          />
        </Transition>
      </div>
      <UiDialog
        v-model="filterOpen"
        class="catalog-drawer"
        slide
        :title="t('catalog.filters')"
        @click.self="filterOpen = false"
        @closed="filtersClosed"
      >
        <form
          v-if="filterMounted"
          class="catalog-filter-form"
          novalidate
          @submit.prevent="applyFilters"
        >
          <div class="catalog-filter-body">
            <UiSelect
              v-model="selectedTypes"
              icon-summary
              :label="t('catalog.type')"
              multiple
              :options="typeOptions"
              :placeholder="t('catalog.allTypes')"
            />
            <div class="catalog-area">
              <UiSelect
                :disabled="!!dictionariesError"
                :label="t('catalog.region')"
                :model-value="nearby ? [] : region"
                :options="regionOptions"
                :pending="dictionariesPending"
                :placeholder="t(nearby ? 'catalog.nearby' : 'catalog.allRegions')"
                searchable
                @update:model-value="chooseRegion"
              />
              <button
                :aria-busy="locating"
                :aria-label="t('catalog.nearby')"
                :aria-pressed="nearby"
                class="tk-button tk-icon-button catalog-nearby"
                :disabled="locating"
                :title="t(locating ? 'catalog.locating' : 'catalog.nearby')"
                type="button"
                @click="chooseNearby"
              >
                <i v-if="locating" aria-hidden="true" class="tk-spinner" />
                <svg v-else aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v2.5M22 12h-2.5M12 22v-2.5M2 12h2.5" /></svg>
              </button>
            </div>
            <p v-if="locationIssue" class="tk-field-error" role="status">{{ t('catalog.denied') }}</p>
            <UiSelect
              v-if="nearby"
              v-model="radius"
              :label="t('catalog.radius')"
              :options="radiusOptions"
              :placeholder="t('catalog.noRadius')"
            />
            <UiDateRange v-model:end="end" v-model:start="start" :label="t('catalog.period')" />
            <p v-if="datesInvalid" class="tk-field-error" role="alert">{{ t('catalog.invalidDates') }}</p>
            <UiSelect
              v-model="selectedDifficulty"
              :disabled="!!dictionariesError"
              :label="t('catalog.difficulty')"
              :options="difficultyOptions"
              :pending="dictionariesPending"
              :placeholder="difficulty[0] || t('catalog.allLevels')"
            />
            <div v-if="dictionariesError" class="catalog-dictionaries-issue">
              <p class="tk-field-error" role="status">{{ t('catalog.dictionariesUnavailable') }}</p>
              <button class="tk-button" type="button" @click="refreshDictionaries()">{{ t('catalog.retry') }}</button>
            </div>
          </div>
          <footer class="catalog-filter-actions">
            <button class="tk-button tk-button-text" type="button" @click="resetDraft">{{ t('catalog.resetDraft') }}</button>
            <button class="tk-button tk-button-primary" :disabled="datesInvalid || locating" type="submit">{{ t('catalog.apply') }}</button>
          </footer>
        </form>
      </UiDialog>
    </div>
  </CatalogFrame>
</template>
