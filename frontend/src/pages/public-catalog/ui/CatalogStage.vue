<script setup lang="ts">
import {
  TripCard,
  useTripRoute,
} from '@fsd/entities/public-trip';
import { TripFavoriteButton } from '@fsd/features/trip-favorite';
import {
  provideTripParticipation,
  TripParticipationAction,
} from '@fsd/features/trip-participation';
import { RouteMap } from '@fsd/shared/map';
import type { MapSelection } from '@fsd/shared/map';
import { workspaceMemberKey } from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';
import {
  UiScrollPagination,
  UiSegmented,
} from '@fsd/shared/ui/kit';
import { SystemErrorState } from '@fsd/shared/ui/page-error';
import type { useCatalogData } from '../model/use-catalog-data';
import { useCatalogExpansion } from '../model/use-catalog-expansion';
import CatalogListSkeleton from './CatalogListSkeleton.vue';
import PublicReadIssue from './PublicReadIssue.vue';
import PublicTripPageView from './PublicTripPage.vue';

const props = defineProps<{ catalog: ReturnType<typeof useCatalogData> }>();
const emit = defineEmits<{ reset: [] }>();
const { t } = useI18n();
const route = useRoute();
const config = useRuntimeConfig().public;
const {
  expandedId, expandedTrip, catalogVisited, filters, screens, showNearbyNotice, filterKey, detail,
  results, listLoading, refresh, pending, status, loadingNext, nextError, more,
} = props.catalog;
const { mobile, mode, routeMap, dayNumber, open: openScreen, back } = screens;
const viewOptions = [{ value: 'map', label: t('catalog.map') }, { value: 'list', label: t('catalog.list') }];
const selected = ref('');
const focus = ref<{ kind: 'point'; id: string; request: number } | null>(null);
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
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
const { viewer, checked, saved, owned, changeFavorite } = provideTripParticipation(
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
function personalActionsReady(tripId: string) {
  return Boolean(viewer.value && viewer.value === member.value?.id && checked.value.has(tripId));
}

watch(expandedId, (id, previous) => {
  if (id) {
    flyFromCatalog.value = !previous && catalogVisited.value && mode.value === 'map' && mapReady.value;
    selected.value = id;
  }
});
watch(() => detail.status.value, (code) => {
  if (code && [403, 404, 410].includes(code)) {
    if (selected.value === expandedId.value) {
      selected.value = '';
    }
    if (focus.value?.id === expandedId.value) {
      focus.value = null;
    }
    forgetLink();
  }
});
watch(filterKey, () => {
  selected.value = '';
});
const points = computed(() => (results.value?.items ?? []).map(trip => ({ id: trip.trip_id, label: trip.title, position: trip.start })));
const current = computed(() => results.value?.items.find(item => item.trip_id === selected.value) ?? results.value?.items[0]);
const mapVisible = computed(() => expandedId.value
  ? !detailUnavailable.value && (!mobile.value || routeScreen.value)
  : (!mobile.value && detailLeaving.value) || (mode.value === 'map' && (listLoading.value || !!current.value)));
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
</script>

<template>
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
      :data-scroll-pending="pending || undefined"
      :data-scroll-region="mode === 'list' ? 'catalog-list' : undefined"
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
      <span v-if="!mobile || mode === 'list'" class="tk-sr-only" role="status">{{ listLoading ? t('catalog.loading') : '' }}</span>
      <template v-if="listLoading || results?.items.length || results?.next_cursor">
        <aside
          ref="sidebar"
          :aria-busy="listLoading"
          :aria-label="t('catalog.list')"
          class="catalog-results"
          :data-scroll-region="mode === 'list' ? undefined : 'catalog-list'"
        >
          <CatalogListSkeleton v-if="listLoading" />
          <div v-else-if="results" class="catalog-rows">
            <div
              v-for="trip in results.items"
              :key="trip.trip_id"
              class="catalog-row"
              :data-scroll-anchor="trip.trip_id"
              :data-trip="trip.trip_id"
            >
              <TripCard
                :active="mode === 'map' && current?.trip_id === trip.trip_id"
                :link-query="route.query"
                :trip="trip"
                @locate="focusMarker"
              >
                <template v-if="personalActionsReady(trip.trip_id) && !owned.has(trip.trip_id)" #favorite>
                  <TripFavoriteButton
                    :saved="saved.has(trip.trip_id)"
                    :title="trip.title"
                    :trip-id="trip.trip_id"
                    @changed="changeFavorite(trip.trip_id, $event)"
                  />
                </template>
                <template #participation><TripParticipationAction :trip="trip" /></template>
              </TripCard>
            </div>
          </div>
          <SystemErrorState
            v-if="nextError"
            class="catalog-more"
            compact
            :description="t('accountTrips.unavailableHint')"
            :status-code="nextError"
            :title="t('accountTrips.moreError')"
          >
            <button class="tk-button" type="button" @click="more">{{ t('catalog.retry') }}</button>
          </SystemErrorState>
          <UiScrollPagination
            v-else-if="results?.next_cursor"
            class="catalog-more"
            :cursor="results.next_cursor"
            :loading="loadingNext"
            :paused="pending || !!expandedId || detailLeaving || (mobile && mode !== 'list')"
            :root="list"
            @more="more"
          />
        </aside>
      </template>
      <section v-else-if="results" class="catalog-empty">
        <h2>{{ t('catalog.empty') }}</h2><p>{{ t(Object.keys(filters).length ? 'catalog.emptyFilters' : 'catalog.emptyHint') }}</p>
        <button
          v-if="Object.keys(filters).length"
          class="tk-button"
          type="button"
          @click="emit('reset')"
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
      <p v-if="mobile && !expandedId && mapReady && listLoading" class="catalog-map-results-loading" role="status">{{ t('catalog.loading') }}</p>
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
        :favorite="personalActionsReady(expandedId) && !owned.has(expandedId) ? saved.has(expandedId) : undefined"
        :mobile="mobile"
        :own="personalActionsReady(expandedId) && owned.has(expandedId)"
        :pending="detail.pending.value"
        :preview="preview"
        :status="detail.status.value"
        :trip="expandedTrip"
        @close="closeDetail"
        @favorite="changeFavorite(expandedId, $event)"
        @retry="detail.refresh"
        @show-map="showRoute(expandedId)"
      />
    </Transition>
  </div>
</template>
