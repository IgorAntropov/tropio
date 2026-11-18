<script setup lang="ts">
const { data } = await useFetch('/api/v1/health')
</script>

<template>
  <main>
    <h1>Tropio</h1>
    <p role="status">{{ data?.status === 'ok' ? 'API работает' : 'API недоступен' }}</p>
  </main>
</template>
