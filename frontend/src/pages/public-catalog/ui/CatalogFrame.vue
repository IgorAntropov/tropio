<script setup lang="ts">
import '@fsd/shared/ui/kit/kit.css'
import './catalog.css'
const { t } = useI18n()
</script>

<template>
  <div class="catalog-frame">
    <a class="catalog-skip" href="#catalog-content">{{ t('workspace.skipToContent') }}</a>
    <header class="catalog-bar">
      <NuxtLink to="/catalog" class="catalog-brand"><img src="/logo.png" width="34" height="34" alt="">{{ t('productName') }}</NuxtLink>
      <nav :aria-label="t('workspace.navigation')">
        <NuxtLink to="/login" class="tk-button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M14 4h5v16h-5M9 7l5 5-5 5M3 12h11" />
          </svg>
          {{ t('identity.login.submit') }}
        </NuxtLink>
      </nav>
    </header>
    <main id="catalog-content" tabindex="-1"><slot /></main>
  </div>
</template>
