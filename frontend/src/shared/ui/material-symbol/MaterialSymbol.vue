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
} as const;

defineProps<{ name: keyof typeof glyphByName }>();
</script>

<template>
  <span aria-hidden="true" class="material-symbols-rounded">
    <svg
      display="block"
      focusable="false"
      height="1em"
      viewBox="0 0 24 24"
      width="1em"
    >
      <text
        fill="currentColor"
        font-size="24"
        x="0"
        y="24"
      >{{ glyphByName[name] }}</text>
    </svg>
  </span>
</template>
