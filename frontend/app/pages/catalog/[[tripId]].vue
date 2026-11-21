<script setup lang="ts">
import { PublicCatalogPage } from '@fsd/pages/public-catalog';
import { workspaceConfirmedKey } from '@fsd/shared/session';

definePageMeta({
  key: 'catalog',
  scrollToTop: false,
  layout: 'workspace',
  middleware: 'workspace',
  publicWorkspace: true,
});

const sessionConfirmed = useState<boolean | null>(workspaceConfirmedKey, () => null);
const catalogSession = ref(0);

watch(sessionConfirmed, (current, previous) => {
  if (previous === true && current === false) {
    catalogSession.value++;
  }
});
</script>

<template><PublicCatalogPage :key="catalogSession" :session-confirmed="sessionConfirmed" /></template>
