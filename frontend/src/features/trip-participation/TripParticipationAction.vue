<script setup lang="ts">
import { computed } from 'vue';
import type { PublicTripSummary } from '@fsd/shared/api';
import { UiButton } from '@fsd/shared/ui/kit';
import { useTripParticipation } from './use-trip-participation';

const props = defineProps<{ trip: Pick<PublicTripSummary, 'trip_id' | 'organizer' | 'applications_open' | 'admission_mode'> }>();
const { t } = useI18n();
const { viewer, owned, sent, joined, busy, errors, apply } = useTripParticipation();
const immediate = computed(() => props.trip.admission_mode === 'open');
const actionLabel = computed(() => {
  if (busy.value.has(props.trip.trip_id)) {
    return immediate.value ? 'participation.joining' : 'participation.sending';
  }
  return immediate.value ? 'participation.join' : 'participation.apply';
});
</script>

<template>
  <div class="participation-action">
    <span v-if="viewer && (owned.has(trip.trip_id) || viewer === trip.organizer?.id)">{{ t('participation.owner') }}</span>
    <span v-else-if="joined.has(trip.trip_id)" role="status">{{ t('participation.joined') }}</span>
    <span v-else-if="sent.has(trip.trip_id) && (!immediate || !trip.applications_open)" role="status">{{ t('participation.sent') }}</span>
    <UiButton
      v-else-if="trip.applications_open"
      :aria-busy="busy.has(trip.trip_id)"
      :disabled="busy.has(trip.trip_id)"
      @click="apply(trip.trip_id, trip.admission_mode)"
    >
      {{ t(actionLabel) }}
    </UiButton>
    <span v-else>{{ t('participation.closed') }}</span>
    <p v-if="errors[trip.trip_id]" class="tk-field-error" role="alert">{{ t(errors[trip.trip_id]!) }}</p>
  </div>
</template>

<style scoped>
.participation-action {
  position: relative;
  z-index: 2;
  color: var(--tk-accent);
  font-size: .8125rem;
  font-weight: 650;
}
.participation-action button { max-width: 100%; color: var(--tk-accent); white-space: normal; line-height: 1.25; }
.participation-action p[role="alert"] { display: block; color: var(--tk-danger); }
</style>
