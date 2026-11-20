<script setup lang="ts">
import type { PublicIdentityProfile } from '@fsd/shared/api'
import { UiAvatar } from '@fsd/shared/ui/kit'
import { usePublicResource } from '../model/use-public-resource'
import CatalogFrame from './CatalogFrame.vue'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const canonical = new URL('/organizers/' + encodeURIComponent(props.id), useRuntimeConfig().public.siteUrl).href
const { ready, value: profile, status, pending, refresh } = usePublicResource('public-organizer-' + props.id, async signal => {
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(props.id)) throw createError({ statusCode: 404 })
  return await $fetch<PublicIdentityProfile>('/api/v1/users/' + encodeURIComponent(props.id), { signal, cache: 'no-store', credentials: 'omit', retry: 0 })
})
const title = computed(() => profile.value?.display_name ?? t('catalog.profileUnavailable'))
useSeoMeta({ title: () => t('pageTitle', { title: title.value }), description: () => profile.value?.bio ?? undefined,
  robots: () => profile.value ? 'index,follow' : 'noindex,nofollow', ogTitle: () => profile.value?.display_name, ogUrl: () => profile.value ? canonical : undefined,
  ogDescription: () => profile.value?.bio ?? undefined })
useHead(() => ({ link: profile.value ? [{ rel: 'canonical', href: canonical }] : [] }))
await ready
if (import.meta.server && status.value !== 200) setResponseStatus(status.value ?? 503)
</script>

<template>
  <CatalogFrame>
    <div class="catalog-detail">
      <NuxtLink class="catalog-back" to="/catalog">← {{ t('catalog.title') }}</NuxtLink>
      <article v-if="profile" class="detail-hero detail-summary catalog-profile">
        <UiAvatar :name="profile.display_name" :src="profile.avatar?.url" />
        <div><span>{{ t('catalog.organizer') }}</span><h1>{{ profile.display_name }}</h1><p v-if="profile.bio">{{ profile.bio }}</p></div>
      </article>
      <div v-else class="catalog-empty"><h1>{{ t(pending ? 'catalog.loadingProfile' : 'catalog.profileUnavailable') }}</h1>
        <button v-if="status === 503" type="button" class="tk-button" @click="refresh">{{ t('catalog.retry') }}</button>
      </div>
    </div>
  </CatalogFrame>
</template>
