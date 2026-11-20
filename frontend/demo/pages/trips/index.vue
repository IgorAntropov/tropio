<script setup lang="ts">
import {
  myDemoTrips,
  TripCatalog,
  TripDetails,
} from '@fsd/pages/demo-trips';
import { SessionCheck } from '@fsd/shared/ui/session-check';
import { useDemoAccount } from '../../composables/useDemoAccount';

defineOptions({ name: 'DemoMyTripsPage' });

const route = useRoute();
const { t } = useI18n();
const { signedIn } = useDemoAccount();
const ready = ref(false);
const trip = computed(() => myDemoTrips.find(item => item.id === route.query.trip));
useSeoMeta({ title: () => t('pageTitle', { title: signedIn.value && trip.value ? trip.value.title : t('workspace.trips') }) });

onMounted(() => {
  ready.value = true;
});
watchEffect(() => {
  if (ready.value && !signedIn.value) {
    void navigateTo({ path: '/login/', query: { returnTo: route.fullPath } }, { replace: true });
  }
});
</script>

<template>
  <main v-if="!ready || !signedIn"><SessionCheck /></main>
  <TripDetails v-else-if="trip" personal :trip="trip" />
  <TripCatalog v-else personal />
</template>
