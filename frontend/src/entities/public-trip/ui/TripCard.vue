<script setup lang="ts">
import type { LocationQuery } from 'vue-router'
import type { PublicTrip, PublicTripSummary } from '@fsd/shared/api'
import { UiButton } from '@fsd/shared/ui/kit'
import OrganizerLink from './OrganizerLink.vue'
import TripFacts from './TripFacts.vue'

defineProps<{ trip: PublicTripSummary | PublicTrip; active?: boolean; expanded?: boolean; showMapAction?: boolean; linkQuery?: LocationQuery }>()
defineEmits<{ locate: [tripId: string]; close: [] }>()
defineSlots<{ participation?(): unknown; timeline?(): unknown }>()
const { t } = useI18n()
</script>

<template>
  <article class="catalog-card" :class="{ 'catalog-card--active': active, 'catalog-card-expanded': expanded }">
    <div class="catalog-cover"><img src="/default-trip-cover.webp" alt="" loading="lazy"></div>
    <header v-if="expanded" class="catalog-expanded-title">
      <h1>{{ trip.title }}</h1>
      <UiButton size="small" icon-only class="catalog-close-trip" :aria-label="t('catalog.closeDetails')" :title="t('catalog.closeDetails')" @click="$emit('close')">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m1 1 12 12M13 1 1 13"/></svg>
      </UiButton>
    </header>
    <h3 v-else><NuxtLink class="catalog-card-link" :title="trip.title" :to="{ path: `/catalog/${trip.trip_id}`, query: linkQuery }" :prefetch="false">{{ trip.title }}</NuxtLink></h3>
    <TripFacts :trip="trip">
      <template #dateNote><span class="catalog-trip-status">{{ t('catalog.lifecycle.' + trip.lifecycle) }}</span></template>
    </TripFacts>
    <div class="catalog-card-copy">
      <OrganizerLink v-if="trip.organizer" :organizer="trip.organizer" compact />
      <p v-if="trip.description">{{ trip.description }}</p>
      <p v-if="'distance_m' in trip && trip.distance_m !== undefined" class="catalog-distance">{{ t('catalog.distance', { distance: new Intl.NumberFormat('ru', { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 }).format(trip.distance_m / 1000) }) }}</p>
    </div>
    <div class="catalog-card-actions">
      <button v-if="!expanded || showMapAction" type="button" class="catalog-view-trip" :aria-label="t('catalog.locate', { title: trip.title })" @click="$emit('locate', trip.trip_id)">{{ t('catalog.viewOnMap') }}</button>
      <div v-if="$slots.participation" :id="expanded ? 'participation' : undefined" class="catalog-participation" :tabindex="expanded ? -1 : undefined"><slot name="participation" /></div>
    </div>
    <div v-if="$slots.timeline" class="catalog-card-timeline"><slot name="timeline" /></div>
  </article>
</template>
