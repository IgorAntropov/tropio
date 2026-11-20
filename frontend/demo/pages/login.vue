<script setup lang="ts">
import { AccountAuthPage } from '@fsd/pages/account-auth';
import { myDemoTrips } from '@fsd/pages/demo-trips';
import { useDemoAccount } from '../composables/useDemoAccount';

defineOptions({ name: 'DemoLoginPage' });
definePageMeta({ layout: false });

const { login, signedIn } = useDemoAccount();
const route = useRoute();
const destination = computed(() => {
  const path = route.query.returnTo;
  if (path === '/trips' || path === '/trips/') {
    return '/trips/';
  }
  const trip = myDemoTrips.find(item => path === `/trips/?trip=${item.id}`);
  return trip ? `/trips/?trip=${trip.id}` : '/';
});

onMounted(() => {
  if (signedIn.value) {
    void navigateTo(destination.value, { replace: true });
  }
});
</script>

<template>
  <AccountAuthPage :demo-login="{ ...login, destination }" mode="login" />
</template>
