<script setup lang="ts">
import { UiSkeleton } from '@fsd/shared/ui/kit';

defineProps<{ days?: number }>();
</script>

<template>
  <div aria-hidden="true" class="catalog-timeline-skeleton">
    <div v-for="day in Math.min(days ?? 2, 3)" :key="day" class="skeleton-day">
      <UiSkeleton /><UiSkeleton /><UiSkeleton />
    </div>
  </div>
</template>

<style scoped>
.catalog-timeline-skeleton { border-block-start: 1px solid var(--tk-line); padding-block-start: var(--tk-space-3); }
.skeleton-day { display: flex; align-items: center; gap: var(--tk-space-2); min-block-size: var(--tk-target); }
.skeleton-day > span { inline-size: 3.5rem; block-size: .75rem; }
.skeleton-day > span:first-child { inline-size: .55rem; block-size: .55rem; }
.skeleton-day > span:last-child { inline-size: 2.25rem; }
</style>
