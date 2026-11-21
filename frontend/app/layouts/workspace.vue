<script setup lang="ts">
import {
  workspaceConfirmedKey,
  workspaceReloadNoticeKey,
} from '@fsd/shared/session';
import { SessionCheck } from '@fsd/shared/ui/session-check';
import { WorkspaceShell } from '@fsd/widgets/workspace-shell';

const route = useRouter().currentRoute;
const sessionConfirmed = useState<boolean | null>(workspaceConfirmedKey, () => null);
const reloadNotice = useState<string | null>(workspaceReloadNoticeKey, () => null);
const immersive = computed(() => route.value.meta.workspaceImmersive === true);
</script>

<template>
  <SessionCheck v-if="reloadNotice" :message="reloadNotice" />
  <WorkspaceShell v-else-if="sessionConfirmed || route.meta.publicWorkspace" :guest="!sessionConfirmed" :immersive="immersive">
    <slot />
  </WorkspaceShell>
  <SessionCheck v-else />
</template>
