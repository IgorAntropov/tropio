<script setup lang="ts">
import {
  UiBackLink,
  UiBrandLogo,
} from '../kit';
import AuthMapBackdrop from './AuthMapBackdrop.vue';

defineProps<{
  title: string;
  auth?: boolean;
  backToLogin?: boolean;
  loginLink?: string;
  catalogLink?: string;
}>();

const { t } = useI18n();
</script>

<template>
  <main class="account-surface" :class="{ 'account-surface-auth': auth }">
    <AuthMapBackdrop v-if="auth" class="account-map" />
    <div class="account-panel" data-scroll-region="account-form">
      <header class="account-panel-header">
        <UiBackLink
          v-if="backToLogin"
          :aria-label="t('identity.backToLogin')"
          class="account-back"
          :title="t('identity.backToLogin')"
          :to="loginLink ?? '/login'"
        >
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
            viewBox="0 0 24 24"
          >
            <path d="m13 5-7 7 7 7M6 12h13" />
          </svg>
        </UiBackLink>
        <NuxtLink :aria-label="auth ? t('identity.catalogBrand', { product: t('productName') }) : undefined" class="account-brand" :to="auth ? catalogLink ?? '/catalog' : '/'">
          <UiBrandLogo :alt="auth ? '' : t('productName')" :height="auth ? 72 : 52" />
        </NuxtLink>
      </header>
      <h1>{{ title }}</h1>
      <slot />
    </div>
  </main>
</template>

<style src="./account.css"></style>
