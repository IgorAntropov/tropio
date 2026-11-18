<script setup lang="ts">
import { TripCatalog } from '@fsd/pages/demo-trips'

defineOptions({ name: 'DemoCatalogPage' })

useSeoMeta({ title: 'Каталог маршрутов · Tropio' })
</script>

<template>
  <TripCatalog />
</template>
