<script setup lang="ts">
import type { PublicIdentityProfile } from '@fsd/shared/api';
import { UiAvatar } from '@fsd/shared/ui/kit';
defineProps<{ organizer: Pick<PublicIdentityProfile, 'id' | 'display_name' | 'avatar'>; compact?: boolean }>();
const { t } = useI18n();
</script>

<template>
  <NuxtLink
    :aria-label="t('catalog.organizerProfile', { name: organizer.display_name })"
    class="catalog-organizer"
    :class="{ 'catalog-organizer-compact': compact }"
    :prefetch="false"
    :title="compact ? organizer.display_name : undefined"
    :to="`/organizers/${organizer.id}`"
  >
    <UiAvatar :name="organizer.display_name" :src="organizer.avatar?.url" />
    <span><small v-if="!compact">{{ t('catalog.organizer') }}</small><strong>{{ organizer.display_name }}</strong></span>
  </NuxtLink>
</template>
