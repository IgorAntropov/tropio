<script setup lang="ts">
import { computed } from 'vue';
import {
  OrganizerLink,
  publicTripCover,
  TripRouteMetrics,
  tripTypeIcons,
} from '@fsd/entities/public-trip';
import { TripFavoriteButton } from '@fsd/features/trip-favorite';
import type { AccountTripCard } from '@fsd/shared/api';
import { formatCalendarPeriod } from '@fsd/shared/i18n/format-calendar-period';
import type { WorkspaceMember } from '@fsd/shared/session';
import { UiImage } from '@fsd/shared/ui/kit';
import { MaterialSymbol } from '@fsd/shared/ui/material-symbol';

const props = defineProps<{ trip: AccountTripCard; member: WorkspaceMember | null; returnTo: string }>();
defineEmits<{ favorite: [saved: boolean] }>();
const { t } = useI18n();
const link = resolveComponent('NuxtLink');
const target = computed(() => ({
  path: (props.trip.is_owner ? '/trips/' : '/catalog/') + props.trip.trip_id,
  query: { returnTo: props.returnTo },
}));
const organizer = computed(() => props.trip.is_owner ? props.member ?? props.trip.organizer : props.trip.organizer);
const cover = computed(() => props.trip.is_owner && props.trip.cover_id
  ? '/api/v1/trips/' + props.trip.trip_id + '/covers/' + props.trip.cover_id
  : publicTripCover(props.trip));
const status = computed(() => {
  if (props.trip.archived) {
    return 'archived';
  }
  if (!props.trip.publication_id) {
    return 'draft';
  }
  if (props.trip.starting_soon) {
    return 'starting_soon';
  }
  return props.trip.lifecycle === 'planned' ? 'published' : props.trip.lifecycle;
});
const date = computed(() => {
  const { start_date: first, end_date: last } = props.trip;
  if (!first && !last) {
    return t('accountTrips.noDates');
  }
  const start = new Date((first ?? last) + 'T00:00:00Z');
  const end = last ? new Date(last + 'T00:00:00Z') : undefined;
  const period = formatCalendarPeriod(t, start, end);
  return first ? period : t('dateRange.through', { date: period });
});
const role = computed(() => {
  if (props.trip.is_owner) {
    return t('participation.owner');
  }
  if (props.trip.participation_status === 'joined') {
    return t(props.trip.lifecycle === 'completed' ? 'accountTrips.participated' : 'accountTrips.participating');
  }
  if (props.trip.participation_status === 'pending') {
    return t('accountTrips.applied');
  }
  return props.trip.saved ? t('accountTrips.saved') : '';
});
const canManage = computed(() => props.trip.is_owner && !props.trip.archived);
const count = computed(() => props.trip.free_capacity === null
  ? String(props.trip.confirmed_participants)
  : t('accountTrips.people', { count: props.trip.confirmed_participants, total: props.trip.free_capacity }));
</script>

<template>
  <article class="account-card">
    <div class="account-card-cover">
      <UiImage alt="" :src="cover"><template #error><img alt="" class="account-cover-fallback" src="/default-trip-cover.webp"></template></UiImage>
      <span class="account-card-status" :data-status="status">{{ t('accountTrips.badge.' + status) }}</span>
      <TripFavoriteButton
        v-if="!trip.is_owner && trip.saved"
        class="account-card-favorite"
        :saved="trip.saved"
        :title="trip.title"
        :trip-id="trip.trip_id"
        @changed="$emit('favorite', $event)"
      />
    </div>
    <div class="account-card-body">
      <h2 :title="trip.title"><NuxtLink v-if="!trip.archived" :prefetch="false" :to="target">{{ trip.title }}</NuxtLink><template v-else>{{ trip.title }}</template></h2>
      <div class="account-card-meta">
        <OrganizerLink
          v-if="organizer"
          compact
          :organizer="organizer"
          :return-to="returnTo"
          :self="trip.is_owner"
        />
        <span class="account-card-date">{{ date }}</span>
      </div>
      <div class="account-card-route">
        <span v-if="trip.trip_type" class="account-card-transport"><MaterialSymbol :name="tripTypeIcons[trip.trip_type]" />{{ t('catalog.types.' + trip.trip_type) }}</span>
        <TripRouteMetrics class="account-card-metrics" :count="trip.route_count" :distance="trip.total_distance_m" />
      </div>
      <div class="account-card-facts">
        <component
          :is="canManage ? link : 'span'"
          :aria-label="t('accountTrips.participantCount', { count })"
          class="account-card-count"
          :title="t('accountTrips.capacity')"
          v-bind="canManage ? { prefetch: false, to: { ...target, hash: '#members' } } : {}"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="7.5" r="3" /><path d="M2.5 20v-2a6.5 6.5 0 0 1 13 0v2M16 5a3 3 0 0 1 0 6m2 2a6 6 0 0 1 3.5 5.5V20" /></svg>
          {{ count }}
        </component>
        <NuxtLink
          v-if="canManage && trip.pending_count"
          :aria-label="t('accountTrips.pendingCount', { count: trip.pending_count })"
          class="account-card-requests"
          :prefetch="false"
          :title="t('accountTrips.pendingCount', { count: trip.pending_count })"
          :to="{ ...target, hash: '#requests' }"
        >+{{ trip.pending_count }}</NuxtLink>
        <span v-if="trip.difficulty">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m2 20 7-15 4 8 3-5 6 12ZM6.5 11l2.4 1.5L11 10" /></svg>{{ trip.difficulty }}
        </span>
        <span v-if="role" class="account-card-role">{{ role }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.account-card { position: relative; display: flex; flex-direction: column; min-inline-size: 0; border: 1px solid var(--tk-line); border-radius: var(--tk-radius); background: var(--tk-surface); box-shadow: 0 2px 6px rgb(17 60 46 / 4%); }
.account-card:focus-within { border-color: var(--tk-focus); }
.account-card-cover { position: relative; aspect-ratio: var(--account-cover-ratio); border-start-start-radius: inherit; border-start-end-radius: inherit; background: var(--tk-raised); }
.account-card-cover > .tk-image { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; }
.account-cover-fallback { inline-size: 100%; block-size: 100%; object-fit: cover; }
.account-card-status { --status-dot: #86e3ce; position: absolute; inset-block-end: var(--tk-space-2); inset-inline-end: var(--tk-space-2); display: inline-flex; align-items: center; gap: .4rem; padding: .24rem .6rem; border: 1px solid rgb(255 255 255 / 48%); border-radius: 2rem; background: rgb(18 44 45 / 76%); backdrop-filter: blur(var(--tk-glass-blur)); color: white; box-shadow: 0 1px 4px rgb(0 0 0 / 17%); font-size: .735rem; font-weight: 650; line-height: 1.3; }
.account-card-status::before { inline-size: .4rem; block-size: .4rem; border-radius: 50%; background: var(--status-dot); content: ''; }
.account-card-status:is([data-status="draft"], [data-status="starting_soon"]) { --status-dot: #ffcb91; }
.account-card-status[data-status="in_progress"] { --status-dot: #bdeb9a; }
.account-card-status:is([data-status="completed"], [data-status="archived"]) { --status-dot: #c8d3d7; }
.account-card-status[data-status="cancelled"] { --status-dot: #ffad9e; }
.account-card-favorite { position: absolute; inset: 0 0 auto auto; }
.account-card-favorite :deep(svg) { filter: drop-shadow(0 0 1px white) drop-shadow(0 1px 1px rgb(255 255 255 / 85%)); }
.account-card-body { display: flex; flex: 1; flex-direction: column; min-inline-size: 0; padding: var(--tk-space-3) var(--tk-space-3) 0; }
.account-card h2 { display: -webkit-box; overflow: hidden; margin: 0; font-size: 1.03rem; line-height: 1.3; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.account-card h2 a { color: inherit; text-decoration: none; }
.account-card h2 a::after { position: absolute; inset: 0; border-radius: var(--tk-radius); content: ''; }
.account-card h2 a:hover { color: var(--tk-accent); }
.account-card-meta { display: flex; align-items: center; justify-content: space-between; gap: var(--tk-space-2); min-block-size: var(--tk-target); margin-block-start: auto; }
.account-card-meta :deep(.catalog-organizer) { min-inline-size: 0; }
.account-card-meta :deep(strong) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-card-date { flex: none; max-inline-size: 55%; margin-inline-start: auto; text-align: end; }
.account-card-route { display: flex; align-items: center; flex-wrap: wrap; gap: .25rem var(--tk-space-2); padding-block-end: var(--tk-space-2); }
.account-card-metrics { margin-inline-start: auto; justify-content: flex-end; }
.account-card-transport { display: inline-flex; align-items: center; gap: .25rem; }
.account-card-transport :deep(.material-symbols-rounded) { color: var(--tk-accent); }
.account-card-date, .account-card-facts, .account-card-route { color: var(--tk-muted); font-size: var(--tk-text-sm); }
.account-card-facts { display: flex; align-items: center; gap: .5rem; min-block-size: var(--tk-target); border-block-start: 1px solid var(--tk-line); }
.account-card-facts > * { display: inline-flex; align-items: center; gap: .25rem; }
.account-card-facts svg { flex: none; width: .9rem; height: .9rem; stroke: var(--tk-accent); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; fill: none; }
.account-card-facts a { position: relative; z-index: 1; align-self: stretch; color: var(--tk-accent); text-decoration: none; }
.account-card-facts a:hover, .account-card-meta a:hover { text-decoration: underline; }
.account-card-facts a { min-inline-size: var(--tk-target); }
.account-card-requests { justify-content: center; font-weight: 650; }
.account-card-requests::before { position: absolute; z-index: -1; inset: 50% .35rem auto; height: 1.35rem; transform: translateY(-50%); border-radius: 1rem; background: var(--tk-selected); content: ''; }
.account-card-role { margin-inline-start: auto; text-align: end; color: var(--tk-accent); font-size: .75rem; font-weight: 600; }
</style>
