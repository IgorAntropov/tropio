<script setup lang="ts">
import type { AccountOverview } from '@fsd/shared/api';
import { UiSkeleton } from '@fsd/shared/ui/kit';

const props = defineProps<{ trips?: AccountOverview['trips']; visitor?: boolean }>();
const { t, n } = useI18n();
const publicStatuses = ['planned', 'in_progress', 'completed'] as const;
const statuses = computed(() => props.visitor ? publicStatuses : [...publicStatuses, 'archived'] as const);
const icons = {
  planned: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 5h16M8 3v4m8-4v4',
  in_progress: 'm21 3-6.3 17-3.2-7.5L4 9.3 21 3Z',
  completed: 'M5 21V4m0 1c5-4 9 3 14-1v10c-5 4-9-3-14 1',
  archived: 'M3 4h18v4H3zM5 8v12h14V8m-10 4h6',
};
</script>

<template>
  <section aria-labelledby="profile-trip-heading" class="profile-trip-stats">
    <h2 id="profile-trip-heading">{{ t('profileOverview.trips') }}</h2>
    <dl :aria-busy="!trips">
      <div class="profile-stats-created">
        <dt>
          {{ t(visitor ? 'profileOverview.publicTrips' : 'profileOverview.tripCounts.created') }}
          <svg
            aria-hidden="true"
            class="profile-stats-map"
            fill="none"
            viewBox="0 0 44 38"
          >
            <path d="m2.5 7 13-4 13 5 13-4v26l-13 4-13-5-13 4Z" fill="var(--tk-surface)" fill-opacity=".7" />
            <path d="M15.5 3v26m13-21v26" opacity=".48" />
            <path d="M8 23c2-8 6-10 12-8s9 7 15-1" stroke-dasharray="2.6 3.1" />
            <circle
              cx="8"
              cy="23"
              fill="currentColor"
              r="1.7"
            />
            <circle
              cx="35"
              cy="13"
              fill="var(--tk-surface)"
              r="2.1"
            />
          </svg>
        </dt>
        <dd><template v-if="trips">{{ n(trips.created) }}</template><UiSkeleton v-else /></dd>
      </div>
      <div v-for="key in statuses" :key="key" class="profile-stats-state">
        <dt>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons[key]" /></svg>
          {{ t('profileOverview.tripCounts.' + key) }}
        </dt>
        <dd><template v-if="trips">{{ n(trips[key]) }}</template><UiSkeleton v-else /></dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.profile-trip-stats { container-type: inline-size; padding-block-start: var(--tk-space-5); border-block-start: 1px solid var(--tk-line); }
.profile-trip-stats h2 { margin: 0 0 var(--tk-space-4); font-size: var(--tk-text-lg); }
.profile-trip-stats dl { display: grid; grid-template-columns: minmax(0, 1.12fr) repeat(2, minmax(0, 1fr)); gap: var(--tk-space-4); margin: 0; }
.profile-trip-stats dt { color: var(--tk-muted); font-size: var(--tk-text-sm); line-height: 1.35; }
.profile-trip-stats dd { margin: 0; color: var(--tk-ink); font-size: 1.45rem; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.1; overflow-wrap: anywhere; }
.profile-stats-created { position: relative; display: grid; grid-template-rows: 1fr auto; grid-row: span 2; align-items: end; justify-items: start; gap: .25rem; padding: 4.1rem var(--tk-space-4) var(--tk-space-4); border-radius: var(--tk-radius); background: var(--tk-selected); color: var(--tk-accent); }
.profile-stats-created dt { grid-row: 2; color: inherit; font-weight: 600; }
.profile-stats-created dd { grid-row: 1; color: inherit; font-size: clamp(1.9rem, 7cqi, 2.5rem); }
.profile-stats-map { position: absolute; inset-block-start: var(--tk-space-4); inset-inline-start: var(--tk-space-4); inline-size: 2.6rem; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.profile-stats-state { display: grid; align-content: center; gap: .35rem; padding-block: var(--tk-space-2); border-block-start: 1px solid var(--tk-line); }
.profile-stats-state:nth-child(4):last-child { grid-column: span 2; }
.profile-stats-state dt { display: flex; align-items: center; flex-wrap: wrap; gap: .3rem; }
.profile-stats-state svg { flex: none; inline-size: 1rem; block-size: 1rem; stroke: var(--tk-accent); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; fill: none; }
.profile-trip-stats dd :deep(.tk-skeleton) { inline-size: 1.4ch; }
@container (max-width: 26rem) {
  .profile-trip-stats dl { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--tk-space-2) var(--tk-space-4); }
  .profile-stats-created { grid-column: 1 / -1; grid-row: auto; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto; align-items: center; gap: var(--tk-space-2); padding: var(--tk-space-3) 4rem var(--tk-space-3) var(--tk-space-4); }
  .profile-stats-created dt { grid-area: 1 / 2; }
  .profile-stats-created dd { grid-area: 1 / 1; }
  .profile-stats-map { inset: 50% var(--tk-space-4) auto auto; transform: translateY(-50%); inline-size: 2.15rem; }
  .profile-stats-state { padding-block: var(--tk-space-3); }
  .profile-stats-state:nth-child(-n + 3) { border-color: transparent; }
}
</style>
