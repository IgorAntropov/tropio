<script setup lang="ts">
import type { EquipmentLibraryItem } from '@fsd/shared/api';

defineProps<{ category: EquipmentLibraryItem['category'] }>();
const paths = {
  bags: 'M9 6V4a3 3 0 0 1 6 0v2M5 12a7 7 0 0 1 14 0v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm3 3h8v4H8z',
  clothing: 'M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0Z',
  camp: 'm3 20 9-15 9 15Zm5 0 4-7 4 7M10 3l4 4m0-4-4 4',
  orientation: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0Zm-6-4-2 6-5 2 2-6Z',
  food: 'M3 7h13v7a6.5 6.5 0 0 1-13 0Zm13 1h2a3 3 0 1 1 0 6h-2M6 3v1m4-1v1',
  health: 'M9 7V5h6v2M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm9 2v6m-3-3h6',
  documents: 'M6 3h10l3 3v15H6zm9 0v5h4M9 12h7m-7 4h5',
  hygiene: 'M7 9h9a2 2 0 0 1 2 2v9H6v-9a2 2 0 0 1 1-2Zm3 0V5h4v4m-4-4V3h7',
  electronics: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 2h4m-3 13h2',
  cooking: 'M5 10h14v6a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5Zm-3 2h3m14 0h3M4 8h16M9 5c-2-1 2-2 0-3m5 3c-2-1 2-2 0-3',
  hiking: 'm2 20 7-13 4 7 3-5 6 11ZM6 13l3 1 2-2M13 5l2-3 3 5',
  cycling: 'M9 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm14 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 16l4-9 5 9H5l9-8m2-4h2l1 12M7 7h4',
  car: 'M4 10 6 5h12l2 5m-17 1 1-1h16l1 1v7H3Zm2 7v2h2v-2m10 0v2h2v-2M6 14h2m8 0h2',
  water: 'M2 17c2 2 4 2 6 0 2 2 4 2 6 0 2 2 4 2 8 0M3 13h17l-4 4M8 12l5-9v9m-1-4L8 6',
  winter: 'M12 2v20M3.5 7l17 10m0-10-17 10M9 4l3 3 3-3m-6 16 3-3 3 3M4 10l4-1V5m12 9-4 1v4M4 14l4 1v4m12-9-4-1V5',
  city: 'M3 21V7h7v14m0-17h10v17M2 21h20M6 10v1m0 3v1m7-8h4m-4 4h4m-4 4h4',
  family: 'M11 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM2 20v-3a6 6 0 0 1 12 0v3m1-7a4 4 0 0 1 6 4v3',
  other: 'm3 12 9-9h7l2 2v7l-9 9Zm14-5h.01',
};
</script>

<template>
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    height="20"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.65"
    viewBox="0 0 24 24"
    width="20"
  >
    <path :d="paths[category]" />
  </svg>
</template>
