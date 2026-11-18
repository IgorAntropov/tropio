<script setup lang="ts">
import { demoTrips } from '../model/trips'
</script>

<template>
  <main class="demo-width demo-main">
    <h1>Каталог маршрутов</h1>
    <p class="demo-summary">Вымышленные маршруты для знакомства с Tropio.</p>
    <ul class="trip-list">
      <li v-for="trip in demoTrips" :key="trip.slug">
        <NuxtLink :to="`/trips/${trip.slug}/`" class="trip-link">
          <span>
            <span class="trip-region">{{ trip.region }}</span>
            <strong>{{ trip.title }}</strong>
          </span>
          <span class="trip-distance">{{ trip.distanceKm }} км · {{ trip.duration }}</span>
          <span aria-hidden="true">↗</span>
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
  grid-template-columns: minmax(0, 1fr) auto 1.1rem;
  align-items: center;
  gap: 0.9rem;
  padding: 1.15rem 0.25rem;
  border-bottom: 1px solid var(--line);
  text-decoration: none;
  transition: background-color 150ms ease-out;
}

.trip-link:hover {
  background: #e7f0e7;
}

.trip-link strong {
  display: block;
  font-size: clamp(1.15rem, 2.5vw, 1.5rem);
  line-height: 1.15;
}

.trip-region,
.trip-distance {
  color: var(--muted);
  font-size: 0.875rem;
}

.trip-link > :last-child {
  color: var(--signal);
}

@media (max-width: 34rem) {
  .trip-link {
    grid-template-columns: minmax(0, 1fr) 1.1rem;
    row-gap: 0.25rem;
  }

  .trip-distance {
    grid-row: 2;
  }

  .trip-link > :last-child {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .trip-link {
    transition: none;
  }
}
</style>
