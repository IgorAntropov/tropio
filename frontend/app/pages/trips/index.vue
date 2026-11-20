<script setup lang="ts">
import { TripDraftsPage } from '@fsd/pages/trip-drafts';

definePageMeta({ layout: 'workspace', middleware: 'workspace' });
useHead({ title: 'Мои путешествия — Тропио', meta: [{ name: 'robots', content: 'noindex' }] });
</script>

<template>
  <TripDraftsPage />
</template>
