<script setup lang="ts">
import {
  TripCard,
  TripTimeline,
} from '@fsd/entities/public-trip';
import { TripParticipationAction } from '@fsd/features/trip-participation';
import type {
  PublicTrip,
  PublicTripSummary,
} from '@fsd/shared/api';
import { UiButton } from '@fsd/shared/ui/kit';
import PublicReadIssue from './PublicReadIssue.vue';

const props = defineProps<{ trip: PublicTrip | null; preview?: PublicTripSummary; status?: number; pending: boolean; mobile: boolean }>();
const day = defineModel<number>('day', { required: true });
const segment = defineModel<string>('segment', { required: true });
const emit = defineEmits<{ close: []; showMap: []; retry: [] }>();
const { t } = useI18n();
const route = useRoute();
const panel = ref<HTMLElement>();
const card = computed(() => props.trip ?? props.preview);
let focusTarget: HTMLElement | undefined;
function focusDetails() {
  if (!panel.value || (!card.value && (props.pending || !props.status))) {
    return;
  }
  const anchor = route.hash === '#participation' && Boolean(props.trip);
  if (route.hash === '#participation' && card.value && !props.trip) {
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
  <section :aria-label="card?.title ?? t('catalog.short')" class="catalog-expanded">
    <div ref="panel" class="catalog-expanded-card">
      <TripCard
        v-if="card"
        expanded
        :show-map-action="mobile && !!trip"
        :trip="card"
        @close="emit('close')"
        @locate="emit('showMap')"
      >
        <template v-if="trip" #participation><TripParticipationAction :trip="trip" /></template>
        <template #timeline>
          <TripTimeline
            v-if="trip"
            v-model:day="day"
            v-model:segment="segment"
            :trip="trip"
          />
          <p v-else role="status">{{ t('catalog.loadingTrip') }}</p>
        </template>
      </TripCard>
      <div v-else class="catalog-detail-issue">
        <UiButton
          :aria-label="t('catalog.closeDetails')"
          class="catalog-close-trip"
          icon-only
          size="small"
          :title="t('catalog.closeDetails')"
          @click="emit('close')"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="14"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.8"
            viewBox="0 0 14 14"
            width="14"
          ><path d="m1 1 12 12M13 1 1 13" /></svg>
        </UiButton>
        <PublicReadIssue :pending="pending" :status="status" @retry="emit('retry')">
          <template #returnToCatalog><button class="tk-button" type="button" @click="emit('close')">{{ t('catalog.open') }}</button></template>
        </PublicReadIssue>
      </div>
    </div>
  </section>
</template>
