<script setup lang="ts">
import { canRetryRead } from '@fsd/shared/api';
import { SystemErrorState } from '@fsd/shared/ui/page-error';

const props = defineProps<{ status?: number; pending: boolean; detail?: boolean }>();
defineEmits<{ retry: [] }>();
defineSlots<{ returnToCatalog?(): unknown }>();
const { t } = useI18n();
const message = computed(() => {
  if (props.status === 400) {
    return { title: t('catalog.invalid'), description: t('catalog.invalidHint') };
  }
  if (props.detail && (props.status === 404 || props.status === 410)) {
    return { title: t('catalog.unavailableTrip'), description: t('catalog.unavailableHint') };
  }
  return undefined;
});
</script>

<template>
  <p v-if="!status || status === 200" class="catalog-empty" role="status">{{ t('catalog.loading') }}</p>
  <SystemErrorState
    v-else
    class="catalog-read-issue"
    compact
    :description="message?.description"
    :heading="detail ? 'h1' : 'h2'"
    :status-code="status"
    :title="message?.title"
  >
    <button
      v-if="canRetryRead(status)"
      class="tk-button tk-button-primary"
      :disabled="pending"
      type="button"
      @click="$emit('retry')"
    >{{ t('catalog.retry') }}</button>
    <slot v-if="detail || !canRetryRead(status)" name="returnToCatalog"><NuxtLink class="tk-button" to="/catalog">{{ t('catalog.open') }}</NuxtLink></slot>
  </SystemErrorState>
</template>
