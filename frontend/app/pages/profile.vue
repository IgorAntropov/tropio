<script setup lang="ts">
import { PersonalProfilePage } from '@fsd/pages/personal-profile';
import { workspaceMemberKey } from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';

definePageMeta({ layout: 'workspace', middleware: 'workspace' });
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
</script>

<template>
  <PersonalProfilePage :key="member?.id" />
</template>
