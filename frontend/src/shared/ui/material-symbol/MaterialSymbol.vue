<script setup lang="ts">
const glyphByName = {
  add_location_alt: '\uEF3A',
  check: '\uE668',
  content_copy: '\uE14D',
  delete_sweep: '\uE16C',
  directions_walk: '\uE536',
  edit: '\uF097',
  pan_tool: '\uE925',
  pedal_bike: '\uEB29',
  directions_car: '\uEFF7',
  alt_route: '\uF184',
  redo: '\uE15A',
  route: '\uEACD',
  undo: '\uE166',
} as const

defineProps<{ name: keyof typeof glyphByName }>()
</script>

<template>
  <span class="material-symbols-rounded" aria-hidden="true">{{ glyphByName[name] }}</span>
</template>
