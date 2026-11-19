<script setup lang="ts">
const props = defineProps<{ statusCode?: number }>()
const { t, locale } = useI18n()
const status = computed(() => props.statusCode ?? 500)
const title = computed(() => t(status.value === 404 ? 'errors.notFound' : 'errors.unexpected'))
const home = useRuntimeConfig().app.baseURL

useHead(() => ({ htmlAttrs: { lang: locale.value } }))
useSeoMeta({ title: () => t('pageTitle', { title: title.value }), robots: 'noindex' })
</script>

<template>
  <main class="grid min-h-screen place-content-center gap-4 px-6 text-center font-sans">
    <p class="m-0 text-4xl font-semibold">{{ status }}</p>
    <h1 class="m-0 text-2xl font-semibold">{{ title }}</h1>
    <a :href="home" class="justify-self-center">{{ t('errors.backHome') }}</a>
  </main>
</template>
