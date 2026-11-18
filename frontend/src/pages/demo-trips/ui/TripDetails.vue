<script setup lang="ts">
import type { DemoTrip } from '../model/trips'

defineProps<{ trip: DemoTrip }>()
</script>

<template>
  <main class="demo-width demo-main">
    <NuxtLink to="/" class="catalog-link">← Все маршруты</NuxtLink>
    <h1>{{ trip.title }}</h1>
    <p class="demo-summary">{{ trip.summary }}</p>
    <dl class="trip-facts">
      <div>
        <dt>Регион</dt>
        <dd>{{ trip.region }}</dd>
      </div>
      <div>
        <dt>Расстояние</dt>
        <dd>{{ trip.distanceKm }} км</dd>
      </div>
      <div>
        <dt>Длительность</dt>
        <dd>{{ trip.duration }}</dd>
      </div>
    </dl>
    <section class="trip-stops">
      <h2>Точки маршрута</h2>
      <ol>
        <li v-for="stop in trip.stops" :key="stop">{{ stop }}</li>
      </ol>
    </section>
  </main>
</template>

<style scoped>
.catalog-link {
  display: inline-block;
  margin-bottom: 1.25rem;
}

.trip-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2.75rem;
  margin: 2rem 0 0;
  padding: 1.15rem 0;
  border-block: 1px solid var(--line);
}

.trip-facts dt {
  color: var(--muted);
  font-size: 0.875rem;
}

.trip-facts dd {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 650;
}

.trip-stops h2 {
  margin: 1.8rem 0 0.6rem;
  font-family: Georgia, serif;
  font-size: 1.65rem;
  font-weight: 400;
}

.trip-stops ol {
  margin: 0;
  padding-left: 1.5rem;
}

.trip-stops li::marker {
  color: var(--signal);
}
</style>
