<script setup lang="ts">
const { t, locale } = useI18n()

useHead(() => ({
  title: t('productName'),
  htmlAttrs: { lang: locale.value },
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
