<script setup lang="ts">
import { UiButton } from '@fsd/shared/ui/kit';

const { t } = useI18n();
</script>

<template>
  <UiButton
    :aria-label="t('catalog.closeDetails')"
    class="catalog-close-trip"
    icon-only
    size="small"
    :title="t('catalog.closeDetails')"
  >
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="1.8"
      viewBox="0 0 14 14"
      width="14"
    ><path d="m1 1 12 12M13 1 1 13" /></svg>
  </UiButton>
</template>
