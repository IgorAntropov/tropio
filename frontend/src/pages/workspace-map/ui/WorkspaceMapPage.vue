<script setup lang="ts">
import { computed } from 'vue';
import { RouteMap } from '@fsd/shared/map';
import {
  UiSelect,
  UiStatus,
} from '@fsd/shared/ui/kit';
import { useWorkspaceMap } from '../model/use-workspace-map';
import '@fsd/shared/ui/kit/kit.css';

const { t, n } = useI18n({
  useScope: 'local',
  messages: {
    ru: {
      title: 'Карта',
      mapLabel: 'Карта маршрута',
      trip: 'Путешествие',
      day: 'День путешествия',
      dayNumber: 'День {number}',
      chooseTrip: 'Выбрать путешествие',
      pointNumber: 'Точка {number}',
      loadingTrips: 'Загружаем путешествия…',
      loadingRoute: 'Загружаем маршрут…',
      listError: 'Не удалось загрузить путешествия.',
      routeError: 'Не удалось загрузить маршрут.',
      noTrips: 'Здесь появятся маршруты твоих путешествий.',
      noDays: 'В этом путешествии пока нет дней.',
      noRoute: 'На этот день маршрут ещё не построен.',
      routeRestricted: 'Геометрия маршрута недоступна.',
      distance: 'Длина маршрута',
      loadMore: 'Показать ещё путешествия',
      retry: 'Повторить',
      openEditor: 'Открыть редактор',
      buildRoute: 'Построить маршрут',
      openTrip: 'Открыть путешествие',
      createTrip: 'Создать путешествие',
      sessionExpired: 'Сессия завершилась. Войди, чтобы открыть свои маршруты.',
      login: 'Войти',
    },
  },
});

const { public: { routeMapStyle } } = useRuntimeConfig();
const {
  trips, trip, day, preview, selectedTripId, nextCursor, listLoading, previewLoading,
  listError, previewError, signedOut, loadTrips, retryTrips, selectTrip, selectDay, retryPreview,
} = useWorkspaceMap();

const tripSelection = computed(() => selectedTripId.value ? [selectedTripId.value] : []);
const daySelection = computed(() => day.value ? [day.value.day_id] : []);
const tripOptions = computed(() => trips.value.map(item => ({ value: item.trip_id, label: item.title })));
const dayOptions = computed(() => trip.value?.days.map(item => ({
  value: item.day_id,
  label: t('dayNumber', { number: item.position }),
})) ?? []);

const readableRoute = computed(() => preview.value?.kind === 'ready' ? preview.value.route : null);
const points = computed(() => readableRoute.value?.points.map((point, index) => ({
  id: point.point_id,
  position: point.position,
  label: point.name || t('pointNumber', { number: index + 1 }),
  number: index + 1,
})) ?? []);
const tracks = computed(() => readableRoute.value?.tracks.map(track => ({
  id: track.track_id,
  coordinates: track.geometry.coordinates,
  transportMode: track.transport_mode,
  dashed: track.status === 'needs_rebuild',
})) ?? []);

const distance = computed(() => {
  const currentTracks = readableRoute.value?.tracks ?? [];
  if (!currentTracks.length || currentTracks.some(track => track.status !== 'ready')) {
    return null;
  }
  const kilometers = currentTracks.reduce((total, track) => total + track.distance_m, 0) / 1000;
  return n(kilometers, { key: 'distance', maximumFractionDigits: 2 });
});
const tripPath = computed(() => trip.value ? `/trips/${trip.value.trip_id}` : null);
const editorPath = computed(() => tripPath.value && day.value && preview.value && preview.value.kind !== 'restricted'
  ? `${tripPath.value}/days/${day.value.day_id}/route?from=map`
  : null);
</script>

<template>
  <main class="workspace-map">
    <section aria-labelledby="workspace-map-title" class="workspace-map__panel">
      <h1 id="workspace-map-title">{{ t('title') }}</h1>

      <template v-if="signedOut">
        <p role="alert">{{ t('sessionExpired') }}</p>
        <NuxtLink class="tk-button tk-button-primary" to="/login">{{ t('login') }}</NuxtLink>
      </template>

      <template v-else>
        <div v-if="tripOptions.length" class="workspace-map__selectors">
          <UiSelect
            :label="t('trip')"
            :model-value="tripSelection"
            :options="tripOptions"
            :placeholder="t('chooseTrip')"
            :searchable="tripOptions.length > 5"
            @update:model-value="selectTrip($event[0])"
          />
          <UiSelect
            v-if="dayOptions.length"
            :label="t('day')"
            :model-value="daySelection"
            :options="dayOptions"
            @update:model-value="selectDay($event[0])"
          />
        </div>

        <UiStatus v-if="listLoading && !trips.length" tone="pending">{{ t('loadingTrips') }}</UiStatus>
        <template v-else-if="listError">
          <p class="workspace-map__error" role="alert">{{ t('listError') }}</p>
          <button class="tk-button" type="button" @click="retryTrips">{{ t('retry') }}</button>
        </template>
        <button
          v-else-if="nextCursor"
          class="tk-button tk-button-text workspace-map__more"
          :disabled="listLoading"
          type="button"
          @click="loadTrips(true)"
        >
          {{ listLoading ? t('loadingTrips') : t('loadMore') }}
        </button>
        <template v-else-if="!trips.length">
          <p>{{ t('noTrips') }}</p>
          <NuxtLink class="tk-button tk-button-primary" to="/trips?new=1">{{ t('createTrip') }}</NuxtLink>
        </template>

        <div v-if="previewLoading || previewError || preview" class="workspace-map__route">
          <UiStatus v-if="previewLoading" tone="pending">{{ t('loadingRoute') }}</UiStatus>
          <template v-else-if="previewError">
            <p class="workspace-map__error" role="alert">{{ t('routeError') }}</p>
            <button class="tk-button" type="button" @click="retryPreview">{{ t('retry') }}</button>
          </template>
          <template v-else-if="preview">
            <p v-if="preview.kind === 'restricted'" role="status">{{ t('routeRestricted') }}</p>
            <p v-else-if="!day">{{ t('noDays') }}</p>
            <p v-else-if="preview.kind !== 'ready'">{{ t('noRoute') }}</p>
            <dl v-else-if="distance !== null" class="workspace-map__distance">
              <dt>{{ t('distance') }}</dt>
              <dd>{{ distance }}</dd>
            </dl>
            <NuxtLink v-if="editorPath" class="tk-button tk-button-primary" :to="editorPath">
              {{ t(preview.kind === 'ready' ? 'openEditor' : 'buildRoute') }}
            </NuxtLink>
            <NuxtLink v-else-if="!day && tripPath" class="tk-button" :to="tripPath">
              {{ t('openTrip') }}
            </NuxtLink>
          </template>
        </div>
      </template>
    </section>

    <section v-if="!signedOut" :aria-label="t('mapLabel')" class="workspace-map__canvas">
      <RouteMap
        :key="readableRoute?.route_id ?? 'basemap'"
        :points="points"
        :route-key="readableRoute?.route_id"
        :style-url="routeMapStyle || undefined"
        :tracks="tracks"
      />
    </section>
  </main>
</template>

<style scoped>
.workspace-map {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--tk-space-4);
  min-height: var(--workspace-content-height, 100dvh);
  padding: clamp(.75rem, 2vw, 1.5rem);
  color: var(--tk-ink);
  background: var(--tk-canvas);
}

.workspace-map__panel {
  position: relative;
  z-index: 1;
  display: grid;
  align-self: start;
  align-content: start;
  gap: var(--tk-space-3);
  min-width: 0;
  padding: clamp(.875rem, 2vw, 1.25rem);
  border: 1px solid var(--tk-line);
  border-radius: var(--tk-radius-panel);
  background: var(--tk-surface);
}

.workspace-map__panel h1 {
  margin: 0;
  font-size: clamp(1.55rem, 3vw, 2rem);
  line-height: 1.15;
}

.workspace-map__panel p {
  margin: 0;
  color: var(--tk-muted);
}

.workspace-map__panel .workspace-map__error { color: var(--tk-danger); }
.workspace-map__panel a { text-decoration: none; }

.workspace-map__selectors,
.workspace-map__route {
  display: grid;
  gap: var(--tk-space-3);
}

.workspace-map__route {
  padding-top: var(--tk-space-3);
  border-top: 1px solid var(--tk-line);
}

.workspace-map__more { justify-self: start; }

.workspace-map__distance {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--tk-space-2);
  margin: 0;
  color: var(--tk-muted);
  font-size: var(--tk-text-base);
}

.workspace-map__distance dd {
  margin: 0;
  color: var(--tk-ink);
  font-weight: 650;
}

.workspace-map__canvas {
  isolation: isolate;
  min-width: 0;
  min-height: clamp(19rem, 56svh, 38rem);
  overflow: hidden;
  border: 1px solid var(--tk-line);
  border-radius: var(--tk-radius-panel);
}

.workspace-map__canvas :deep(.maplibregl-ctrl-top-right) { top: 0; }

@media (min-width: 36rem) and (max-width: 63.999rem) {
  .workspace-map__selectors { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 64rem) {
  .workspace-map {
    grid-template-columns: minmax(15rem, 19rem) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

}
</style>
