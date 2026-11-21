<script setup lang="ts">
import { PublicOrganizerPage } from '@fsd/pages/public-catalog/organizer';
import {
  workspaceConfirmedKey,
  workspaceMemberKey,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';

definePageMeta({
  key: route => route.path,
  layout: 'workspace',
  middleware: ['workspace', (to) => {
    const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
    if (member.value?.id === String(to.params.id).toLowerCase()) {
      return navigateTo('/profile', { replace: true });
    }
  }],
  publicWorkspace: true,
});
const sessionConfirmed = useState<boolean | null>(workspaceConfirmedKey, () => null);
const route = useRoute();
</script>

<template><PublicOrganizerPage :id="String(route.params.id)" :session-confirmed="sessionConfirmed" /></template>
