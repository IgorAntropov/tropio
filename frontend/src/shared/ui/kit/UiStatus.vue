<script setup lang="ts">
defineProps<{
  tone: 'success' | 'pending' | 'muted' | 'warning' | 'danger'
}>()
</script>

<template>
  <span class="tk-status" :data-tone="tone" role="status">
    <i v-if="tone === 'pending'" class="tk-spinner" aria-hidden="true" />
    <i v-else class="tk-status-dot" aria-hidden="true" />
    <slot />
  </span>
</template>
