<script setup lang="ts">
import { publicTripCover } from '@fsd/entities/public-trip';
import { useCatalogData } from '../model/use-catalog-data';
import CatalogFrame from './CatalogFrame.vue';
import CatalogStage from './CatalogStage.vue';
import CatalogToolbar from './CatalogToolbar.vue';

defineProps<{ sessionConfirmed: boolean | null }>();
const catalog = useCatalogData();
const { expandedId, expandedTrip, filters, near, showNearbyNotice, screens, detail, status, ready } = catalog;
const { mode } = screens;
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig().public;
const toolbar = useTemplateRef('toolbar');

function resetFilters() {
  toolbar.value?.resetInput();
  near.value = undefined;
  void router.replace({ query: mode.value === 'list' ? { view: 'list' } : {} });
}

const canonical = computed(() => new URL('/catalog' + (expandedId.value ? '/' + encodeURIComponent(expandedId.value) : ''), config.siteUrl).href);
const title = computed(() => expandedId.value ? expandedTrip.value?.title ?? t(detail.status.value === 404 ? 'catalog.unavailableTrip' : 'catalog.short') : t('catalog.title'));
const description = computed(() => expandedId.value
  ? (expandedTrip.value ? expandedTrip.value.description || t('catalog.tripDescription', { title: expandedTrip.value.title }) : undefined)
  : t('catalog.description'));
useSeoMeta({
  title: () => t('pageTitle', { title: title.value }),
  description: () => description.value,
  ogTitle: () => expandedId.value ? expandedTrip.value?.title : title.value,
  ogDescription: () => description.value,
  ogUrl: () => expandedId.value && !expandedTrip.value ? undefined : canonical.value,
  ogImage: () => expandedTrip.value ? new URL(publicTripCover(expandedTrip.value), config.siteUrl).href : undefined,
  robots: () => expandedId.value
    ? (expandedTrip.value ? 'index,follow' : 'noindex,nofollow')
    : status.value === 200 && !Object.keys(route.query).length ? 'index,follow' : 'noindex,follow',
});
useHead(() => ({ link: expandedId.value && !expandedTrip.value ? [] : [{ rel: 'canonical', href: canonical.value }] }));
if (import.meta.server) {
  await Promise.all([ready, detail.ready]);
  const httpStatus = expandedId.value ? detail.status.value : status.value;
  if (httpStatus !== 200) {
    setResponseStatus(httpStatus ?? 503);
  }
}
</script>

<template>
  <CatalogFrame :session-confirmed="sessionConfirmed">
    <div class="catalog-page" :class="{ 'workspace-page-panel': sessionConfirmed, 'catalog-list-mode': mode === 'list', 'catalog-trip-open': !!expandedId }">
      <h1 v-if="!expandedId" class="tk-sr-only">{{ t('catalog.title') }}</h1>
      <CatalogToolbar
        ref="toolbar"
        v-model:near="near"
        :catalog-active="!expandedId"
        :filters="filters"
      />
      <p v-if="showNearbyNotice && mode !== 'list'" class="catalog-location">{{ t('catalog.nearbyActive') }}</p>
      <CatalogStage :catalog="catalog" @reset="resetFilters" />
    </div>
  </CatalogFrame>
</template>
