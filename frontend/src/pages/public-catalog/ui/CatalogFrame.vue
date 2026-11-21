<script setup lang="ts">
import { UiBrandLogo } from '@fsd/shared/ui/kit';
import '@fsd/shared/ui/kit/kit.css';
import './catalog.css';

defineProps<{ sessionConfirmed?: boolean | null }>();
const { t } = useI18n();
</script>

<template>
  <div :class="{ 'catalog-frame': !sessionConfirmed, 'catalog-frame--checking': sessionConfirmed === null }" data-catalog-frame>
    <a v-if="!sessionConfirmed" class="catalog-skip" href="#catalog-content">{{ t('workspace.skipToContent') }}</a>
    <header v-if="!sessionConfirmed" class="catalog-bar">
      <NuxtLink class="catalog-brand" to="/catalog"><UiBrandLogo :alt="t('productName')" /></NuxtLink>
      <nav :aria-label="t('workspace.navigation')">
        <NuxtLink class="tk-button" to="/login">
          <svg
            aria-hidden="true"
            fill="none"
            focusable="false"
            height="20"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.65"
            viewBox="0 0 24 24"
            width="20"
          >
            <path d="M14 4h5v16h-5M9 7l5 5-5 5M3 12h11" />
          </svg>
          {{ t('identity.login.submit') }}
        </NuxtLink>
      </nav>
    </header>
    <main id="catalog-content" :class="{ 'catalog-workspace-content': sessionConfirmed }" tabindex="-1"><slot /></main>
  </div>
</template>
