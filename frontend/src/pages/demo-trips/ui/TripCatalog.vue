<script setup lang="ts">
import { TripFacts } from '@fsd/entities/public-trip';
import {
  demoTrips,
  myDemoTrips,
} from '../model/trips';

defineProps<{ personal?: boolean }>();
const { t, n } = useI18n();
const { baseURL } = useRuntimeConfig().app;
</script>

<template>
  <main class="demo-width demo-main">
    <h1>{{ t(personal ? 'workspace.trips' : 'demo.catalog.title') }}</h1>
    <p v-if="!personal" class="demo-summary">{{ t('demo.catalog.summary') }}</p>
    <ul class="trip-list">
      <li v-for="trip in personal ? myDemoTrips : demoTrips" :key="trip.id">
        <NuxtLink
          class="trip-link"
          :to="personal ? { path: '/trips/', query: { trip: trip.id } } : `/trips/${trip.slug}/`"
        >
          <img
            alt=""
            class="trip-cover"
            height="112"
            loading="lazy"
            :src="baseURL + 'default-trip-cover.webp'"
            width="112"
          >
          <div class="trip-copy">
            <span>{{ trip.region }}</span>
            <strong class="trip-title" :title="trip.title">{{ trip.title }}</strong>
            <span class="trip-organizer" :title="trip.organizerName">{{ trip.organizerName }}</span>
            <span class="trip-summary">{{ trip.summary }}</span>
            <span>{{ n(trip.distanceKm, 'distance') }}</span>
          </div>
          <TripFacts :trip="{ ...trip.facts, difficulty: t('demo.difficulty.' + trip.difficulty) }">
            <template #dateNote><span>{{ t('tripDrafts.status.' + trip.status) }}</span></template>
          </TripFacts>
        </NuxtLink>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.trip-list {
  padding: 0;
  margin: clamp(2rem, 5vw, 3.5rem) 0 0;
  list-style: none;
  border-top: 1px solid var(--line);
}

.trip-link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(12rem, .6fr);
  align-items: center;
  gap: 1.25rem;
  padding: 1rem .25rem;
  border-bottom: 1px solid var(--line);
  text-decoration: none;
}

.trip-link:hover {
  background: #e7f0e7;
}

.trip-cover {
  width: clamp(4.5rem, 9vw, 7rem);
  height: auto;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: .5rem;
}

.trip-copy,
.trip-link :deep(.trip-facts-date-column),
.trip-link :deep(.trip-facts-values) {
  display: grid;
  gap: .2rem;
}

.trip-copy,
.trip-link :deep(.trip-facts) {
  color: var(--muted);
  font-size: .875rem;
  line-height: 1.4;
}

.trip-copy strong {
  color: var(--ink);
  font-size: clamp(1.15rem, 2.5vw, 1.5rem);
  line-height: 1.2;
}

.trip-title,
.trip-organizer {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trip-summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.trip-link :deep(.trip-facts) {
  display: grid;
  gap: .35rem;
}

.trip-link :deep(.trip-facts-values) {
  display: flex;
  flex-wrap: wrap;
  gap: .2rem .75rem;
}

.trip-link :deep(.material-symbols-rounded) {
  vertical-align: -.1em;
}

@media (max-width: 40rem) {
  .trip-link {
    grid-template-columns: auto minmax(0, 1fr);
    gap: .65rem 1rem;
  }

  .trip-link :deep(.trip-facts) {
    grid-column: 1 / -1;
  }
}
</style>
