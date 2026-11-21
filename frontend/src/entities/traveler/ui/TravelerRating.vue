<script setup lang="ts">
import { computed } from 'vue';
import type { AccountOverview } from '@fsd/shared/api';

const props = defineProps<{ rating: AccountOverview['rating'] }>();
const { t, locale } = useI18n();
const average = computed(() => props.rating.average?.toLocaleString(locale.value, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
}));
const votes = computed(() => t('profileOverview.votes.' + new Intl.PluralRules(locale.value).select(props.rating.count), { count: props.rating.count }));
const ridge = 'M1.4 18.5 9.8 3.3l5.5 9.6 3-4.6 5.3 10.2Z';
const snow = 'm6.2 9.8 2.1 1.3 2-1.75 2.9 1.45';
</script>

<template>
  <div
    :aria-label="t('profileOverview.rating')"
    class="traveler-rating"
    role="group"
    :title="t('profileOverview.rating')"
  >
    <div aria-hidden="true" class="traveler-rating-marks">
      <span v-for="index in 5" :key="index" class="traveler-rating-mark">
        <svg viewBox="0 0 25 22"><path :d="ridge" /><path class="traveler-snow" :d="snow" /></svg>
        <svg
          class="traveler-rating-fill"
          :style="{ clipPath: 'inset(0 ' + (100 - 100 * Math.max(0, Math.min(1, (rating.average ?? 0) - index + 1))) + '% 0 0)' }"
          viewBox="0 0 25 22"
        ><path :d="ridge" /><path class="traveler-snow" :d="snow" /></svg>
      </span>
    </div>
    <template v-if="average && rating.count">
      <strong aria-hidden="true">{{ average }}</strong>
      <span class="tk-sr-only">{{ t('profileOverview.ratingValue', { value: average }) }}</span>
      <span>{{ votes }}</span>
    </template>
    <span v-else>{{ t('profileOverview.noRatings') }}</span>
  </div>
</template>

<style scoped>
.traveler-rating { display: flex; align-items: center; flex-wrap: wrap; gap: .25rem .55rem; color: var(--tk-muted); font-size: var(--tk-text-sm); }
.traveler-rating-marks { display: inline-flex; align-items: center; gap: .125rem; color: var(--tk-accent); }
.traveler-rating-mark { position: relative; display: block; inline-size: 1.25rem; aspect-ratio: 25 / 22; }
.traveler-rating-mark svg { display: block; inline-size: 100%; block-size: 100%; fill: var(--tk-raised); stroke: var(--tk-field-line); stroke-width: 1.45; stroke-linejoin: round; stroke-linecap: round; }
.traveler-rating-mark .traveler-rating-fill { position: absolute; inset: 0; fill: currentColor; stroke: currentColor; }
.traveler-snow { fill: none; }
.traveler-rating-fill .traveler-snow { stroke: var(--tk-on-accent); }
.traveler-rating strong { color: var(--tk-ink); font-variant-numeric: tabular-nums; }
</style>
