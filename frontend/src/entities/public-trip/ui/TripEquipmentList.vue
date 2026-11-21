<script setup lang="ts">
import type { PublicTrip } from '@fsd/shared/api';

defineProps<{ items: PublicTrip['equipment'] }>();
const { t } = useI18n();
</script>

<template>
  <section v-if="items?.length" class="trip-equipment-list">
    <h2>{{ t('tripDrafts.gear.title') }}</h2>
    <ul>
      <li v-for="(item, index) in items" :key="index">
        <span>{{ item.label }}</span>
        <small>{{ t(item.required ? 'tripDrafts.gear.required' : 'tripDrafts.gear.optional') }}</small>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.trip-equipment-list { margin-block-start: var(--tk-space-4, 1rem); }
.trip-equipment-list h2 { margin: 0 0 .5rem; font-size: 1rem; }
.trip-equipment-list ul { margin: 0; padding: 0; list-style: none; }
.trip-equipment-list li { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .25rem .75rem; padding-block: .4rem; border-block-start: 1px solid var(--tk-line, #cbdad5); overflow-wrap: anywhere; }
.trip-equipment-list small { color: var(--tk-muted, #48625b); }
</style>
