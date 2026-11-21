<script setup lang="ts">
import {
  TripCard,
  TripCloseButton,
  TripEquipmentList,
  TripTimeline,
} from '@fsd/entities/public-trip';
import { TripFavoriteButton } from '@fsd/features/trip-favorite';
import { TripParticipationAction } from '@fsd/features/trip-participation';
import type {
  PublicTrip,
  PublicTripSummary,
} from '@fsd/shared/api';
import {
  UiBackLink,
  UiSkeleton,
} from '@fsd/shared/ui/kit';
import { catalogQuery } from '../model/use-catalog-screens';
import CatalogDetailSkeleton from './CatalogDetailSkeleton.vue';
import CatalogTimelineSkeleton from './CatalogTimelineSkeleton.vue';
import PublicReadIssue from './PublicReadIssue.vue';

const props = withDefaults(defineProps<{ trip: PublicTrip | null; preview?: PublicTripSummary; status?: number; pending: boolean; mobile: boolean; favorite?: boolean; own: boolean }>(), { preview: undefined, status: undefined, favorite: undefined });
const day = defineModel<number>('day', { required: true });
const segment = defineModel<string>('segment', { required: true });
const emit = defineEmits<{ close: []; showMap: []; retry: []; favorite: [saved: boolean] }>();
const { t } = useI18n();
const route = useRoute();
const panel = ref<HTMLElement>();
const card = computed(() => props.trip ?? props.preview);
let focusTarget: HTMLElement | undefined;
function focusDetails() {
  if (!panel.value) {
    return;
  }
  const anchor = route.hash === '#participation' && Boolean(props.trip);
  if (route.hash === '#participation' && !props.trip && (card.value || props.pending)) {
    return;
  }
  const target = panel.value.querySelector<HTMLElement>(anchor ? '#participation' : '.catalog-close-trip');
  if (!target || target === focusTarget) {
    return;
  }
  if (!focusTarget || document.activeElement === document.body) {
    target.focus({ preventScroll: !anchor });
  }
  focusTarget = target;
}
onMounted(focusDetails);
watch(() => [props.trip?.trip_id, props.pending, props.status], focusDetails, { flush: 'post' });
</script>

<template>
  <section :aria-label="card?.title ?? t('catalog.short')" class="catalog-expanded" :class="{ 'catalog-expanded-unavailable': status && status !== 200 }">
    <div
      ref="panel"
      class="catalog-expanded-card"
      :data-scroll-pending="pending || undefined"
      data-scroll-region="catalog-detail"
    >
      <span v-if="pending && !trip" class="tk-sr-only" role="status">{{ t('catalog.loadingTrip') }}</span>
      <TripCard
        v-if="card"
        expanded
        :show-map-action="mobile && !!trip"
        :trip="card"
        @close="emit('close')"
        @locate="emit('showMap')"
      >
        <template v-if="trip && favorite !== undefined && !own" #favorite>
          <TripFavoriteButton
            :key="trip.trip_id"
            :saved="favorite"
            :title="trip.title"
            :trip-id="trip.trip_id"
            @changed="emit('favorite', $event)"
          />
        </template>
        <template #participation>
          <div v-if="trip" class="catalog-personal-actions">
            <TripParticipationAction :trip="trip" />
            <NuxtLink v-if="own" class="tk-button" :to="{ path: '/trips/' + trip.trip_id, hash: '#members' }">{{ t('accountTrips.manageRoster') }}</NuxtLink>
          </div>
          <UiSkeleton v-else class="catalog-participation-skeleton" />
        </template>
        <template #timeline>
          <TripTimeline
            v-if="trip"
            v-model:day="day"
            v-model:segment="segment"
            :trip="trip"
          />
          <CatalogTimelineSkeleton v-else :days="card.day_count" />
          <TripEquipmentList v-if="trip" :items="trip.equipment" />
        </template>
      </TripCard>
      <CatalogDetailSkeleton v-else-if="!status || status === 200" @close="emit('close')" />
      <div v-else class="catalog-detail-issue">
        <TripCloseButton @click="emit('close')" />
        <PublicReadIssue
          detail
          :pending="pending"
          :status="status"
          @retry="emit('retry')"
        >
          <template #returnToCatalog>
            <UiBackLink class="tk-button" :to="{ path: '/catalog', query: catalogQuery(route.query) }">{{ t('catalog.open') }}</UiBackLink>
          </template>
        </PublicReadIssue>
      </div>
    </div>
  </section>
</template>

<style scoped>
.catalog-personal-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--tk-space-2); }
.catalog-participation-skeleton { inline-size: 9rem; max-inline-size: 100%; block-size: var(--tk-target); }
</style>
