<script setup lang="ts">
const glyphByName = {
  directions_walk: '\uE536',
  pedal_bike: '\uEB29',
  directions_car: '\uEFF7',
  alt_route: '\uF184',
} as const

defineProps<{ name: keyof typeof glyphByName }>()
</script>

<template>
  <span class="material-symbols-rounded" aria-hidden="true">{{ glyphByName[name] }}</span>
</template>
