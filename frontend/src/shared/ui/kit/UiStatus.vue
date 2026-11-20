<script setup lang="ts">
defineProps<{
  tone: 'success' | 'pending' | 'muted' | 'warning' | 'danger';
}>();
</script>

<template>
  <span class="tk-status" :data-tone="tone" role="status">
    <i v-if="tone === 'pending'" aria-hidden="true" class="tk-spinner" />
    <i v-else aria-hidden="true" class="tk-status-dot" />
    <slot />
  </span>
</template>
