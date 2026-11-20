<script setup lang="ts">
defineProps<{ status?: number; pending: boolean }>();
defineEmits<{ retry: [] }>();
defineSlots<{ returnToCatalog?(): unknown }>();
const { t } = useI18n();
</script>

<template>
  <section class="catalog-empty">
    <p v-if="pending || !status" role="status">{{ t('catalog.loading') }}</p>
    <template v-else>
      <h2>{{ t(status === 404 ? 'catalog.unavailableTrip' : status === 400 ? 'catalog.invalid' : 'catalog.offline') }}</h2>
      <p>{{ t(status === 404 ? 'catalog.unavailableHint' : status === 400 ? 'catalog.invalidHint' : 'catalog.offlineHint') }}</p>
      <button
        v-if="status !== 404 && status !== 400"
        class="tk-button"
        type="button"
        @click="$emit('retry')"
      >{{ t('catalog.retry') }}</button>
      <slot v-else name="returnToCatalog"><NuxtLink class="tk-button" to="/catalog">{{ t('catalog.open') }}</NuxtLink></slot>
    </template>
  </section>
</template>
