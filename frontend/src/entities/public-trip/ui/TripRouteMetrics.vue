<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ count: number; distance: number | null }>();
const { t, n, locale } = useI18n();
const routes = computed(() => t('catalog.routeCount.' + new Intl.PluralRules(locale.value).select(props.count), { count: props.count }));
const length = computed(() => props.distance === null
  ? null
  : n(props.distance / 1000, {
      key: 'distance',
      maximumFractionDigits: props.distance > 0 && props.distance < 100 ? 3 : 1,
    }));
</script>

<template>
  <span class="trip-route-metrics">
    <span>{{ routes }}</span>
    <span v-if="length !== null" class="trip-route-length" :title="t('catalog.totalLength')"><span class="tk-sr-only">{{ t('catalog.totalLength') }} — </span>{{ length }}</span>
  </span>
</template>

<style scoped>
.trip-route-metrics { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 0 .35rem; }
.trip-route-metrics > span { white-space: nowrap; }
.trip-route-length::before { display: inline-block; margin-inline-end: .35rem; color: var(--tk-field-line); content: '·'; }
</style>
