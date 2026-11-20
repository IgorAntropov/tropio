<script setup lang="ts">
import {
  computed,
  useId,
} from 'vue';
import type { PublicTrip } from '@fsd/shared/api';
import { RouteScheme } from '@fsd/shared/ui/route-scheme';
import type { SchemeSelection } from '@fsd/shared/ui/route-scheme';
import { routeScheme } from '../trip-route';

const props = defineProps<{ trip: PublicTrip }>();
const day = defineModel<number>('day', { required: true });
const segment = defineModel<string>('segment', { required: true });
const { t, locale } = useI18n();
const id = useId();
const dates = computed(() => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long', timeZone: 'UTC' }));
const days = computed(() => props.trip.days.map((item) => {
  const route = routeScheme(item);
  const points = route.points.map((point, index) => ({
    ...point,
    label: point.label || t('catalog.routeStops.' + point.stop, { number: index + 1 }),
  }));
  const tracks = route.tracks.map((track, index) => {
    const mode = track.transportMode && t('catalog.types.' + track.transportMode);
    return {
      id: track.id,
      label: track.name || mode || t('catalog.routeLeg', { number: index + 1 }),
      transportMode: track.transportMode,
      distance: track.distance,
      detail: track.name ? mode : undefined,
    };
  });
  return { ...item, points, tracks };
}));
const selection = computed<SchemeSelection | undefined>(() => {
  const route = days.value.find(item => item.position === day.value);
  if (route?.points.some(point => point.id === segment.value)) {
    return { type: 'point', id: segment.value };
  }
  if (route?.tracks.some(track => track.id === segment.value)) {
    return { type: 'track', id: segment.value };
  }
  return undefined;
});
function toggle(position: number) {
  segment.value = '';
  day.value = day.value === position ? 0 : position;
}
</script>

<template>
  <section :aria-label="t('catalog.routeTimeline')" class="trip-timeline">
    <ol class="trip-days" :style="{ '--trip-day-count': Math.max(1, days.length) }">
      <li
        v-for="(item, index) in days"
        :key="item.position"
        class="trip-day"
        :style="{ '--trip-day-index': index }"
      >
        <button
          :aria-controls="id + '-route-' + item.position"
          :aria-expanded="day === item.position"
          class="trip-day-toggle"
          type="button"
          @click="toggle(item.position)"
        >
          <span>{{ t('catalog.day', { day: item.position }) }}</span>
          <time v-if="item.local_date" :datetime="item.local_date">{{ dates.format(new Date(item.local_date + 'T00:00:00Z')) }}</time>
          <i aria-hidden="true" class="tk-chevron" />
        </button>
        <div
          :id="id + '-route-' + item.position"
          class="trip-day-scheme"
          :class="{ 'is-open': day === item.position }"
          :inert="day !== item.position"
        >
          <div>
            <p v-if="item.description" class="trip-day-description">{{ item.description }}</p>
            <RouteScheme
              interactive
              :label="t('catalog.routeScheme')"
              :points="item.points"
              :selection="selection"
              :tracks="item.tracks"
              @select="target => segment = target.id"
            />
          </div>
        </div>
      </li>
    </ol>
    <template v-if="trip.pois.length">
      <h3 class="trip-places-title">{{ t('publication.pois') }}</h3>
      <ul class="trip-places">
        <li v-for="poi in trip.pois" :key="poi.poi_id">
          <button :aria-pressed="segment === poi.poi_id" type="button" @click="segment = poi.poi_id">{{ poi.name }}</button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.trip-timeline { min-width: 0; border-top: 1px solid var(--tk-line); padding-block-start: var(--tk-space-3); }
.trip-timeline h3 { margin: 0 0 var(--tk-space-2); font-size: .9375rem; }
.trip-days, .trip-places { list-style: none; margin: 0; padding: 0; }
.trip-timeline .trip-places-title { margin-block-start: var(--tk-space-3); }
.trip-day { position: relative; --trip-day-indent: calc(var(--tk-space-2) + var(--tk-space-3)); }
.trip-day::before { content: ''; position: absolute; left: 0; top: 18px; width: 8px; height: 8px; border: 2px solid var(--tk-accent); border-radius: 50%; background: var(--tk-surface); }
.trip-day:not(:last-child)::after { content: ''; position: absolute; left: 3px; top: 26px; bottom: -18px; width: 2px; background: var(--tk-line); }
.trip-day-toggle { display: flex; align-items: center; width: 100%; min-height: var(--tk-target); gap: var(--tk-space-2); border: 0; padding: 0; padding-inline-start: var(--trip-day-indent); background: transparent; color: var(--tk-ink); text-align: start; font: 650 .88rem/1.3 Inter, sans-serif; cursor: pointer; }
.trip-day-toggle time { color: var(--tk-muted); font-size: .78rem; font-weight: 500; }
.trip-day-toggle .tk-chevron { margin-inline-start: auto; }
.trip-day-toggle[aria-expanded=true] .tk-chevron { transform: rotate(225deg); }
.trip-day-scheme { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 180ms ease; }
.trip-day-scheme.is-open { grid-template-rows: 1fr; }
.trip-day-scheme > div { min-height: 0; overflow: hidden; }
.trip-day-description { color: var(--tk-muted); margin: .25rem 0 .45rem; padding-inline-start: var(--trip-day-indent); font-size: .8125rem; }
.trip-places { border-inline-start: 2px solid var(--tk-line); margin: 0 0 .5rem .35rem; padding-inline-start: .4rem; }
.trip-places button { display: flex; align-items: center; gap: .4rem; width: 100%; min-height: 44px; border: 0; border-radius: .4rem; padding: .25rem .4rem; background: transparent; color: var(--tk-ink); text-align: start; font: 500 .8125rem/1.3 Inter, sans-serif; cursor: pointer; }
.trip-places button:is(:hover, [aria-pressed=true]) { color: var(--tk-accent); background: var(--tk-selected); }
@media (prefers-reduced-motion: reduce) { .trip-day-scheme { transition: none; } }
</style>
