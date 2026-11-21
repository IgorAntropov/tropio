<script setup lang="ts">
import {
  TripCardSkeleton,
  TripCloseButton,
} from '@fsd/entities/public-trip';
import CatalogTimelineSkeleton from './CatalogTimelineSkeleton.vue';

defineEmits<{ close: [] }>();
</script>

<template>
  <div class="catalog-detail-issue catalog-detail-pending">
    <TripCloseButton @click="$emit('close')" />
    <TripCardSkeleton expanded>
      <template #timeline><CatalogTimelineSkeleton /></template>
    </TripCardSkeleton>
  </div>
</template>
