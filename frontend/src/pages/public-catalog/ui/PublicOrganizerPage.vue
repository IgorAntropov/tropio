<script setup lang="ts">
import type { PublicIdentityProfile } from '@fsd/shared/api';
import {
  canRetryRead,
  isResourceId,
} from '@fsd/shared/api';
import { accountTripsReturnPath } from '@fsd/shared/session';
import { UiAvatar } from '@fsd/shared/ui/kit';
import { SystemErrorState } from '@fsd/shared/ui/page-error';
import { usePublicResource } from '../model/use-public-resource';
import CatalogFrame from './CatalogFrame.vue';

const props = defineProps<{ id: string; sessionConfirmed: boolean | null }>();
const { t } = useI18n();
const route = useRoute();
const fromTrips = computed(() => accountTripsReturnPath(route.query.returnTo));
const canonical = new URL('/organizers/' + encodeURIComponent(props.id), useRuntimeConfig().public.siteUrl).href;
const { ready, value: profile, status, pending, refresh } = usePublicResource('public-organizer-' + props.id, async (signal) => {
  if (!isResourceId(props.id)) {
    throw createError({ statusCode: 404 });
  }
  return await $fetch<PublicIdentityProfile>('/api/v1/users/' + encodeURIComponent(props.id), {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    retry: 0,
  });
});
const title = computed(() => profile.value?.display_name ?? t('catalog.profileUnavailable'));
useSeoMeta({
  title: () => t('pageTitle', { title: title.value }),
  description: () => profile.value?.bio ?? undefined,
  robots: () => profile.value ? 'index,follow' : 'noindex,nofollow',
  ogTitle: () => profile.value?.display_name,
  ogUrl: () => profile.value ? canonical : undefined,
  ogDescription: () => profile.value?.bio ?? undefined,
});
useHead(() => ({ link: profile.value ? [{ rel: 'canonical', href: canonical }] : [] }));
await ready;
if (import.meta.server && status.value !== 200) {
  setResponseStatus(status.value ?? 503);
}
</script>

<template>
  <CatalogFrame :session-confirmed="sessionConfirmed">
    <div class="catalog-detail">
      <NuxtLink v-if="profile" class="catalog-back" :to="fromTrips ?? '/catalog'">← {{ t(fromTrips ? 'workspace.trips' : 'catalog.title') }}</NuxtLink>
      <article v-if="profile" class="detail-hero detail-summary catalog-profile">
        <UiAvatar :name="profile.display_name" :src="profile.avatar?.url" />
        <div><span>{{ t('catalog.organizer') }}</span><h1>{{ profile.display_name }}</h1><p v-if="profile.bio">{{ profile.bio }}</p></div>
      </article>
      <SystemErrorState
        v-else-if="status && status !== 200"
        class="catalog-profile-issue"
        heading="h1"
        :status-code="status"
        :title="status === 404 || status === 410 ? t('catalog.profileUnavailable') : undefined"
      >
        <button
          v-if="canRetryRead(status)"
          class="tk-button tk-button-primary"
          :disabled="pending"
          type="button"
          @click="refresh"
        >{{ t('catalog.retry') }}</button>
        <NuxtLink class="tk-button" :to="fromTrips ?? '/catalog'">{{ t(fromTrips ? 'workspace.trips' : 'catalog.open') }}</NuxtLink>
      </SystemErrorState>
      <p v-else class="catalog-empty" role="status">{{ t('catalog.loadingProfile') }}</p>
    </div>
  </CatalogFrame>
</template>
