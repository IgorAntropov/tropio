<script setup lang="ts">
import type { PublicIdentityProfile } from '@fsd/shared/api';
import { UiAvatar } from '@fsd/shared/ui/kit';
defineProps<{ organizer: Pick<PublicIdentityProfile, 'id' | 'display_name' | 'avatar'>; compact?: boolean; self?: boolean; returnTo?: string }>();
const { t } = useI18n();
const link = resolveComponent('NuxtLink');
</script>

<template>
  <component
    :is="self ? 'span' : link"
    :aria-label="self ? undefined : t('catalog.organizerProfile', { name: organizer.display_name })"
    class="catalog-organizer"
    :class="{ 'catalog-organizer-compact': compact }"
    :title="compact ? organizer.display_name : undefined"
    v-bind="self ? {} : { prefetch: false, to: { path: '/organizers/' + organizer.id, query: returnTo ? { returnTo } : undefined } }"
  >
    <UiAvatar :name="organizer.display_name" :src="organizer.avatar?.url" />
    <span><small v-if="!compact">{{ t('catalog.organizer') }}</small><strong>{{ organizer.display_name }}</strong></span>
  </component>
</template>

<style scoped>
.catalog-organizer { position: relative; z-index: 2; display: inline-flex; align-items: center; gap: .55rem; color: var(--tk-accent); text-decoration: none; min-height: 44px; margin-top: .75rem; font-size: .9rem; }
.catalog-organizer > span:last-child { min-width: 0; }
.catalog-organizer small, .catalog-organizer strong { display: block; overflow-wrap: anywhere; }
.catalog-organizer small { color: var(--tk-muted); }
.catalog-organizer-compact { margin: 0; gap: .4rem; font-size: .78rem; }
.catalog-organizer-compact :deep(.tk-avatar) { --tk-avatar-size: 1.4rem; width: 1.4rem; height: 1.4rem; flex-shrink: 0; }
.catalog-organizer-compact :deep(.tk-avatar-image) { font-size: .64rem; }
</style>
