<script setup lang="ts">
defineProps<{
  title: string
  wide?: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <main class="account-surface" :class="{ 'account-surface-wide': wide }">
    <div class="account-panel">
      <NuxtLink class="account-brand" to="/">
        <img width="34" height="34" src="/logo.png" alt="">
        <span>{{ t('productName') }}</span>
      </NuxtLink>
      <h1>{{ title }}</h1>
      <slot />
    </div>
  </main>
</template>

<style src="./account.css"></style>
