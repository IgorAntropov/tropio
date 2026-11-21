<script setup lang="ts">
import { UiSkeleton } from '@fsd/shared/ui/kit';

defineProps<{ expanded?: boolean }>();
</script>

<template>
  <div aria-hidden="true" class="catalog-card catalog-card-skeleton" :class="{ 'catalog-card-expanded': expanded }">
    <UiSkeleton class="catalog-cover" />
    <div class="skeleton-title"><UiSkeleton /></div>
    <div class="trip-facts">
      <div class="trip-facts-date-column">
        <UiSkeleton class="skeleton-date" />
        <UiSkeleton class="skeleton-badge" />
      </div>
      <div class="trip-facts-values">
        <UiSkeleton v-for="fact in 5" :key="fact" />
      </div>
    </div>
    <div class="catalog-card-copy">
      <div class="skeleton-organizer"><UiSkeleton /><UiSkeleton /></div>
      <div class="skeleton-description"><UiSkeleton /><UiSkeleton /><UiSkeleton /></div>
    </div>
    <div class="catalog-card-actions"><UiSkeleton class="skeleton-action" /><UiSkeleton class="skeleton-join" /></div>
    <div v-if="expanded" class="catalog-card-timeline"><slot name="timeline" /></div>
  </div>
</template>

<style scoped>
.catalog-card-skeleton { pointer-events: none; }
.catalog-card-skeleton .catalog-cover { block-size: auto; }
.skeleton-title { grid-area: title; display: flex; align-items: center; min-block-size: 1.25rem; }
.skeleton-title > span { inline-size: 75%; block-size: .875rem; }
.catalog-card-expanded .skeleton-title { min-block-size: 2rem; }
.catalog-card-skeleton .trip-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.trip-facts-date-column { padding-block-start: .2em; }
.skeleton-date { inline-size: min(90%, 5.75rem); block-size: .8em; }
.skeleton-badge { inline-size: min(95%, 6.5rem); block-size: 1.35rem; border-radius: .45rem; }
.catalog-card-skeleton .trip-facts-values { grid-auto-rows: 1.4em; align-items: center; }
.trip-facts-values > span { inline-size: min(85%, 5.5rem); block-size: .75em; }
.trip-facts-values > span:nth-child(odd) { inline-size: min(65%, 3.75rem); }
.trip-facts-values > span:last-child { inline-size: min(95%, 7rem); }
.skeleton-organizer { display: flex; align-items: center; gap: .4rem; min-block-size: var(--tk-target); }
.skeleton-organizer > span:first-child { inline-size: 1.4rem; block-size: 1.4rem; border-radius: 50%; }
.skeleton-organizer > span:last-child { inline-size: min(58%, 12rem); block-size: .7rem; }
.skeleton-description { display: grid; grid-auto-rows: 1.45em; align-items: center; font-size: .8125rem; }
.skeleton-description > span { block-size: .8em; }
.skeleton-description > span:nth-child(2) { inline-size: 76%; }
.skeleton-description > span:last-child { display: none; inline-size: 55%; }
.skeleton-action { inline-size: min(36%, 7.5rem); block-size: .75rem; }
.skeleton-join { inline-size: min(51%, 11.5rem); block-size: var(--tk-target); }
.catalog-card-expanded .skeleton-action { display: none; }
@container (max-width: 26rem) {
  .skeleton-description > span:last-child { display: block; }
  .skeleton-join { block-size: max(var(--tk-target), calc(2 * .8125rem * 1.25 + 2 * var(--tk-space-2) + 2px)); }
}
@container (max-width: 22rem) {
  .catalog-card-skeleton .trip-facts-values { grid-template-rows: repeat(4, 1.4em) 2.8em; }
}
@container (max-width: 20.99rem) {
  .catalog-card-skeleton .trip-facts-values { grid-template-rows: repeat(3, 1.4em) repeat(2, 2.8em); }
}
@media (min-width: 700px) and (min-height: 600px) and ((max-width: 1039px) or (pointer: coarse)) {
  .catalog-row .skeleton-action { align-self: center; justify-self: center; }
  .catalog-row .catalog-card-actions { grid-auto-rows: var(--tk-target); }
  .catalog-row .skeleton-join { inline-size: 100%; block-size: var(--tk-target); }
}
</style>
