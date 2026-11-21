<script setup lang="ts">
import {
  TravelerRating,
  useAccountOverview,
} from '@fsd/entities/traveler';
import { UiSkeleton } from '@fsd/shared/ui/kit';

const props = defineProps<{ active: boolean }>();
const { t } = useI18n();
const { overview, error, reload } = useAccountOverview(() => props.active);
</script>

<template>
  <TravelerRating v-if="overview" :rating="overview.rating" />
  <div v-else-if="error" class="workspace-rating-error" role="status">
    <span>{{ t('profileOverview.ratingError') }}</span>
    <button class="tk-button tk-button-small tk-button-text" type="button" @click="reload">{{ t('identity.retry') }}</button>
  </div>
  <div v-else :aria-label="t('identity.loading')" role="status"><UiSkeleton class="workspace-rating-skeleton" /></div>
</template>

<style scoped>
.workspace-rating-error { display: flex; align-items: center; justify-content: space-between; gap: var(--tk-space-2); color: var(--tk-muted); font-size: var(--tk-text-sm); }
.workspace-rating-skeleton { inline-size: 11rem; }
</style>
