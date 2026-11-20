<script setup lang="ts">
const { t } = useI18n()
const { data } = await useFetch('/api/v1/health')
</script>

<template>
  <main>
    <h1>{{ t('productName') }}</h1>
    <p role="status">{{ t(data?.status === 'ok' ? 'home.apiAvailable' : 'home.apiUnavailable') }}</p>
    <nav class="flex flex-wrap gap-4" :aria-label="t('identity.navigation')">
      <NuxtLink to="/login">{{ t('identity.login.submit') }}</NuxtLink>
      <NuxtLink to="/register">{{ t('identity.register.submit') }}</NuxtLink>
      <NuxtLink to="/trips">Мои путешествия</NuxtLink>
      <NuxtLink to="/profile">{{ t('identity.profile.link') }}</NuxtLink>
    </nav>
  </main>
</template>
