<script setup lang="ts">
import type { PublicTripSummary } from '@fsd/shared/api';
import { formatCalendarPeriod } from '@fsd/shared/i18n/format-calendar-period';
import { MaterialSymbol } from '@fsd/shared/ui/material-symbol';
import { tripTypeIcons } from '../trip-type';

const props = defineProps<{ trip: Pick<PublicTripSummary, 'start_date' | 'end_date' | 'trip_type' | 'difficulty' | 'free_capacity' | 'day_count' | 'confirmed_participants'> }>();
defineSlots<{ dateNote?(): unknown }>();
const { t, locale } = useI18n();
const availablePlaces = computed(() => props.trip.free_capacity === null ? null : Math.max(0, props.trip.free_capacity - (props.trip.confirmed_participants ?? 0)));
const daysText = computed(() => {
  const form = new Intl.PluralRules(locale.value).select(props.trip.day_count);
  return t('catalog.daysCount.' + form, { count: props.trip.day_count });
});
const dateText = computed(() => {
  const dates = [props.trip.start_date, props.trip.end_date].filter((item): item is string => !!item);
  const [first, last] = dates.map(date => new Date(date + 'T00:00:00Z'));
  if (!first) {
    return '';
  }
  return formatCalendarPeriod(t, first, last);
});
</script>

<template>
  <div class="trip-facts">
    <div v-if="dateText || $slots.dateNote" class="trip-facts-date-column">
      <span v-if="dateText" class="trip-facts-date">{{ dateText }}</span>
      <slot name="dateNote" />
    </div>
    <div class="trip-facts-values">
      <span v-if="trip.trip_type" :title="t('catalog.types.' + trip.trip_type)"><MaterialSymbol :name="tripTypeIcons[trip.trip_type]" /> {{ t('catalog.types.' + trip.trip_type) }}</span>
      <span v-if="trip.difficulty">{{ trip.difficulty }}</span>
      <span>{{ daysText }}</span>
      <span v-if="availablePlaces !== null">{{ t('catalog.capacity', { count: availablePlaces }) }}</span>
    </div>
  </div>
</template>
