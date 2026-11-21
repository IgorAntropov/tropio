<script setup lang="ts">
import { RouteEditorPage } from '@fsd/pages/route-editor';

const route = useRoute();
const tripId = computed(() => String(route.params.tripId));
const dayId = computed(() => String(route.params.dayId));
definePageMeta({
  layout: 'workspace',
  middleware: 'workspace',
  workspaceImmersive: true,
  key: route => route.path,
});

const { t } = useI18n();
useHead(() => ({
  title: t('pageTitle', { title: t('routeEditor.title') }),
  meta: [{ name: 'robots', content: 'noindex' }],
}));
</script>

<template>
  <RouteEditorPage :day-id="dayId" :trip-id="tripId" />
</template>
