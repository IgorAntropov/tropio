<script setup lang="ts">
import { UiBrandLogo } from '../kit';
import SystemErrorState from './SystemErrorState.vue';

const props = withDefaults(defineProps<{ statusCode?: number; retryPath?: unknown }>(), { statusCode: 500, retryPath: undefined });
const { t } = useI18n();
const { baseURL } = useRuntimeConfig().app;
const retryable = computed(() => props.statusCode === 429 || props.statusCode >= 500);
const retryUrl = computed(() => {
  const path = props.retryPath;
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /\s/.test(path)) {
    return '';
  }
  return baseURL + path.slice(1);
});
</script>

<template>
  <div class="system-page">
    <header class="system-page-bar">
      <a :aria-label="t('errors.homeBrand')" class="system-page-brand" :href="baseURL">
        <UiBrandLogo :alt="t('productName')" />
      </a>
    </header>
    <main class="system-page-panel">
      <SystemErrorState heading="h1" page :status-code="statusCode">
        <a v-if="retryable" class="system-action system-action--primary" :href="retryUrl">{{ t('errors.retry') }}</a>
        <a class="system-action" :class="{ 'system-action--primary': !retryable }" :href="baseURL">{{ t('errors.backHome') }}</a>
      </SystemErrorState>
    </main>
  </div>
</template>
