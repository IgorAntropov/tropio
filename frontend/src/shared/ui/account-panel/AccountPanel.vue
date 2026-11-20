<script setup lang="ts">
import AuthMapBackdrop from './AuthMapBackdrop.vue'

defineProps<{
  title: string
  wide?: boolean
  auth?: boolean
  backToLogin?: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <main class="account-surface" :class="{ 'account-surface-wide': wide, 'account-surface-auth': auth }">
    <AuthMapBackdrop v-if="auth" class="account-map" />
    <div class="account-panel">
      <header class="account-panel-header">
        <NuxtLink
          v-if="backToLogin" class="account-back" to="/login"
          :aria-label="t('identity.backToLogin')" :title="t('identity.backToLogin')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m13 5-7 7 7 7M6 12h13" />
          </svg>
        </NuxtLink>
        <NuxtLink class="account-brand" to="/">
          <img :width="auth ? 52 : 34" :height="auth ? 52 : 34" src="/logo.png" alt="">
          <span>{{ t('productName') }}</span>
        </NuxtLink>
      </header>
      <h1>{{ title }}</h1>
      <slot />
    </div>
  </main>
</template>

<style src="./account.css"></style>
