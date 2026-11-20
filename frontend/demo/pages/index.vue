<script setup lang="ts">
import { TripCatalog } from '@fsd/pages/demo-trips';

defineOptions({ name: 'DemoCatalogPage' });

const { t } = useI18n();

useSeoMeta({ title: () => t('pageTitle', { title: t('demo.catalog.title') }) });
</script>

<template>
  <TripCatalog />
</template>
