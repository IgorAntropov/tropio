<script setup lang="ts">
const { t } = useI18n()
const { data } = await useFetch('/api/v1/health')
</script>

<template>
  <main>
    <h1>{{ t('productName') }}</h1>
    <p role="status">{{ t(data?.status === 'ok' ? 'home.apiAvailable' : 'home.apiUnavailable') }}</p>
  </main>
</template>
