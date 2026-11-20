<script setup lang="ts">
import {
  demoTrips,
  TripDetails,
} from '@fsd/pages/demo-trips';

defineOptions({ name: 'DemoTripPage' });

definePageMeta({ key: route => route.path });

const route = useRoute();
const { t } = useI18n();
const trip = demoTrips.find(item => item.slug === route.params.slug);

if (!trip) {
  throw createError({ status: 404 });
}

useSeoMeta({ title: () => t('pageTitle', { title: trip.title }) });
</script>

<template>
  <TripDetails :trip="trip" />
</template>
