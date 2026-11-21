<script setup lang="ts">
import { PublicOrganizerPage } from '@fsd/pages/public-catalog';
import { workspaceConfirmedKey } from '@fsd/shared/session';

definePageMeta({
  key: route => route.path,
  layout: 'workspace',
  middleware: 'workspace',
  publicWorkspace: true,
});
const sessionConfirmed = useState<boolean | null>(workspaceConfirmedKey, () => null);
const route = useRoute();
</script>

<template><PublicOrganizerPage :id="String(route.params.id)" :session-confirmed="sessionConfirmed" /></template>
