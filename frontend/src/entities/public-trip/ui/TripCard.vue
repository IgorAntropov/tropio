<script setup lang="ts">
import type { LocationQuery } from 'vue-router';
import type {
  PublicTrip,
  PublicTripSummary,
} from '@fsd/shared/api';
import { UiImage } from '@fsd/shared/ui/kit';
import { publicTripCover } from '../trip-cover';
import OrganizerLink from './OrganizerLink.vue';
import TripCloseButton from './TripCloseButton.vue';
import TripFacts from './TripFacts.vue';
import TripRouteMetrics from './TripRouteMetrics.vue';

defineProps<{ trip: PublicTripSummary | PublicTrip; active?: boolean; expanded?: boolean; showMapAction?: boolean; linkQuery?: LocationQuery }>();
defineEmits<{ locate: [tripId: string]; close: [] }>();
defineSlots<{ favorite?(): unknown; participation?(): unknown; timeline?(): unknown }>();
const { t } = useI18n();
</script>

<template>
  <article class="catalog-card" :class="{ 'catalog-card--active': active, 'catalog-card-expanded': expanded }">
    <div class="catalog-cover">
      <UiImage alt="" :loading="expanded ? 'eager' : 'lazy'" :src="publicTripCover(trip)">
        <template v-if="trip.cover_id" #error><img alt="" loading="lazy" src="/default-trip-cover.webp"></template>
      </UiImage>
      <slot name="favorite" />
    </div>
    <header v-if="expanded" class="catalog-expanded-title">
      <h1>{{ trip.title }}</h1>
      <TripCloseButton @click="$emit('close')" />
    </header>
    <h3 v-else><NuxtLink
      class="catalog-card-link"
      :prefetch="false"
      :title="trip.title"
      :to="{ path: `/catalog/${trip.trip_id}`, query: linkQuery }"
    >{{ trip.title }}</NuxtLink></h3>
    <TripFacts :trip="trip">
      <template #dateNote>
        <span class="catalog-trip-status">{{ t('catalog.lifecycle.' + trip.lifecycle) }}</span>
      </template>
      <template #routeMetrics><TripRouteMetrics :count="trip.route_count" :distance="trip.total_distance_m" /></template>
    </TripFacts>
    <div class="catalog-card-copy">
      <OrganizerLink v-if="trip.organizer" compact :organizer="trip.organizer" />
      <p v-if="trip.description">{{ trip.description }}</p>
      <p v-if="'distance_m' in trip && trip.distance_m !== undefined" class="catalog-distance">{{ t('catalog.distance', { distance: new Intl.NumberFormat('ru', { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 }).format(trip.distance_m / 1000) }) }}</p>
    </div>
    <div class="catalog-card-actions">
      <button
        v-if="!expanded || showMapAction"
        :aria-label="t('catalog.locate', { title: trip.title })"
        class="catalog-view-trip"
        type="button"
        @click="$emit('locate', trip.trip_id)"
      >{{ t('catalog.viewOnMap') }}</button>
      <div
        v-if="$slots.participation"
        :id="expanded ? 'participation' : undefined"
        class="catalog-participation"
        :tabindex="expanded ? -1 : undefined"
      ><slot name="participation" /></div>
    </div>
    <div v-if="$slots.timeline" class="catalog-card-timeline"><slot name="timeline" /></div>
  </article>
</template>
