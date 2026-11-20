<script setup lang="ts">
import { workspaceConfirmedKey } from '@fsd/shared/session'
import { SessionCheck } from '@fsd/shared/ui/session-check'
import { WorkspaceShell } from '@fsd/widgets/workspace-shell'

const route = useRoute()
const sessionConfirmed = useState<boolean>(workspaceConfirmedKey, () => false)
const immersive = computed(() => route.meta.workspaceImmersive === true)
</script>

<template>
  <WorkspaceShell v-if="sessionConfirmed" :immersive="immersive">
    <slot />
  </WorkspaceShell>
  <SessionCheck v-else />
</template>
