<script setup lang="ts">
import { TripDraftsPage } from '@fsd/pages/trip-drafts';
import { isResourceId } from '@fsd/shared/api';

const route = useRoute();
const tripId = computed(() => String(route.params.tripId));
definePageMeta({
  layout: 'workspace',
  middleware: 'workspace',
  key: route => route.path,
  validate: route => isResourceId(route.params.tripId),
});

const { t } = useI18n();
useHead(() => ({
  title: t('pageTitle', { title: t('tripDrafts.programTitle') }),
  meta: [{ name: 'robots', content: 'noindex' }],
}));
</script>

<template>
  <TripDraftsPage :trip-id="tripId" />
</template>
