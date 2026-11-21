<script setup lang="ts">
import { AccountTripsPage } from '@fsd/pages/trip-drafts';

definePageMeta({ layout: 'workspace', middleware: 'workspace' });

const { t } = useI18n();
useHead(() => ({
  title: t('pageTitle', { title: t('workspace.trips') }),
  meta: [{ name: 'robots', content: 'noindex' }],
}));
</script>

<template>
  <AccountTripsPage />
</template>
