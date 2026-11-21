<script setup lang="ts">
import { LogoutConfirmation } from '@fsd/features/confirm-logout';
import { UiBrandLogo } from '@fsd/shared/ui/kit';
import '@fsd/shared/ui/kit/kit.css';
import { useDemoAccount } from './composables/useDemoAccount';

const { t, locale } = useI18n();
const route = useRoute();
const { displayName, signedIn, signOut } = useDemoAccount();
const mounted = ref(false);
const confirmingLogout = ref(false);
onMounted(() => {
  mounted.value = true;
});

async function logout() {
  confirmingLogout.value = false;
  await navigateTo('/', { replace: true });
  signOut();
}

useSeoMeta({ robots: 'noindex' });
useHead(() => ({
  htmlAttrs: { lang: locale.value },
}));
</script>

<template>
  <div class="demo-shell font-sans">
    <header v-if="route.meta.layout !== false" class="demo-header demo-width flex items-center justify-between">
      <NuxtLink class="demo-wordmark" to="/"><UiBrandLogo :alt="t('productName')" /></NuxtLink>
      <nav :aria-label="t('identity.navigation')" class="demo-account">
        <span>{{ mounted && signedIn ? displayName : t('demo.label') }}</span>
        <NuxtLink v-if="mounted && signedIn" to="/trips/">{{ t('workspace.trips') }}</NuxtLink>
        <button
          v-if="mounted && signedIn"
          aria-haspopup="dialog"
          type="button"
          @click="confirmingLogout = true"
        >{{ t('identity.logout') }}</button>
        <NuxtLink v-else to="/login/">{{ t('identity.login.submit') }}</NuxtLink>
      </nav>
    </header>
    <NuxtPage />
    <LogoutConfirmation v-model="confirmingLogout" @confirm="logout" />
  </div>
</template>

<style>
body {
  margin: 0;
}

.demo-shell {
  --ink: #142e2d;
  --muted: #4a6460;
  --paper: #f4f8f3;
  --line: #b4c5bb;
  --signal: #a03917;
  --focus: #146e62;
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font-size: 16px;
  line-height: 1.6;
}

.demo-shell a {
  color: inherit;
  text-underline-offset: 0.22em;
}

.demo-shell a:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 4px;
}

.demo-width {
  width: min(100% - 3rem, 62rem);
  margin-inline: auto;
}

.demo-header {
  min-height: 4.5rem;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

.demo-account {
  display: flex;
  align-items: center;
  gap: .85rem;
  margin-inline-start: 1rem;
  text-align: end;
  line-height: 1.25;
}

.demo-account a,
.demo-account button {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  border: 0;
  padding: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: .22em;
  cursor: pointer;
}

.demo-account button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 4px;
}

@media (max-width: 40rem) {
  .demo-header:has(.demo-account button) {
    display: grid;
    gap: .25rem;
    padding-block: .75rem;
  }

  .demo-account:has(button) {
    flex-wrap: wrap;
    gap: 0 1rem;
    margin: 0;
    text-align: start;
  }
}

.demo-header .demo-wordmark {
  display: inline-flex;
  align-items: center;
}

.demo-main {
  padding-block: clamp(2.25rem, 6vw, 5rem);
}

.demo-main h1 {
  max-width: 15ch;
  margin: 0;
  font-family: Georgia, serif;
  font-size: clamp(2.4rem, 7vw, 5rem);
  font-weight: 400;
  line-height: 1.03;
  letter-spacing: -0.035em;
  overflow-wrap: anywhere;
}

.demo-summary {
  max-width: 42ch;
  margin: 1.15rem 0 0;
  color: var(--muted);
}
</style>
