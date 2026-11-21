<script setup lang="ts">
import { TripCardSkeleton } from '@fsd/entities/public-trip';
</script>

<template>
  <div class="catalog-rows">
    <div v-for="row in 4" :key="row" class="catalog-row">
      <TripCardSkeleton />
    </div>
  </div>
</template>
