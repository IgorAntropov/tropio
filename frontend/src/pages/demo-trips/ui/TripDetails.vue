<script setup lang="ts">
import { TripFacts } from '@fsd/entities/public-trip';
import type { DemoTrip } from '../model/trips';

defineProps<{ trip: DemoTrip; personal?: boolean }>();
const { t, n } = useI18n();
</script>

<template>
  <main class="demo-width demo-main">
    <NuxtLink class="catalog-link" :to="personal ? '/trips/' : '/'">
      <span aria-hidden="true">←</span> {{ t(personal ? 'workspace.trips' : 'demo.trip.backToCatalog') }}
    </NuxtLink>
    <h1>{{ trip.title }}</h1>
    <p class="demo-summary">{{ trip.summary }}</p>
    <dl class="trip-details">
      <div><dt>{{ t('catalog.organizer') }}</dt><dd>{{ trip.organizerName }}</dd></div>
      <div><dt>{{ t('demo.trip.region') }}</dt><dd>{{ trip.region }}</dd></div>
      <div><dt>{{ t('demo.trip.distance') }}</dt><dd>{{ n(trip.distanceKm, 'distance') }}</dd></div>
    </dl>
    <TripFacts class="route-facts" :trip="{ ...trip.facts, difficulty: t('demo.difficulty.' + trip.difficulty) }">
      <template #dateNote><span>{{ t('tripDrafts.status.' + trip.status) }}</span></template>
    </TripFacts>
    <section class="trip-stops">
      <h2>{{ t('catalog.program') }}</h2>
      <section v-for="(day, index) in trip.days" :key="index">
        <h3>{{ t('catalog.day', { day: index + 1 }) }}</h3>
        <p>{{ day.description }}</p>
        <ol><li v-for="stop in day.stops" :key="stop.name">{{ stop.name }}</li></ol>
      </section>
    </section>
  </main>
</template>

<style scoped>
.catalog-link { display: inline-block; margin-bottom: 1.25rem; }
.trip-details { display: flex; flex-wrap: wrap; gap: .75rem 2.75rem; margin: 2rem 0 .8rem; }
.trip-details dt { color: var(--muted); font-size: .875rem; }
.trip-details dd { margin: 0; font-size: 1.1rem; font-weight: 650; }
.route-facts { display: grid; gap: .4rem; padding: 1rem 0; border-block: 1px solid var(--line); }
.route-facts :deep(.trip-facts-values),
.route-facts :deep(.trip-facts-date-column) { display: flex; flex-wrap: wrap; gap: .25rem 1.25rem; }
.trip-stops { max-width: 48rem; }
.trip-stops h2 { margin: 1.8rem 0 .6rem; font-family: Georgia, serif; font-size: 1.65rem; font-weight: 400; }
.trip-stops h3 { margin: 1rem 0 .35rem; }
.trip-stops p { margin: 0 0 .5rem; }
.trip-stops ol { margin: 0; padding-left: 1.5rem; }
.trip-stops li::marker { color: var(--signal); }
</style>
