<script setup lang="ts">
import {
  ProfileAchievements,
  ProfileTripStats,
  TravelerProfileLayout,
  TravelerRating,
} from '@fsd/entities/traveler';
import type {
  PublicIdentityProfile,
  PublicProfileOverview,
} from '@fsd/shared/api';
import {
  canRetryRead,
  isResourceId,
} from '@fsd/shared/api';
import {
  accountTripsReturnPath,
  workspaceMemberKey,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';
import {
  UiAvatar,
  UiBackLink,
  UiSkeleton,
} from '@fsd/shared/ui/kit';
import { SystemErrorState } from '@fsd/shared/ui/page-error';
import { usePublicResource } from '../model/use-public-resource';
import { useVisitingProfile } from '../model/use-visiting-profile';
import CatalogFrame from './CatalogFrame.vue';

const props = defineProps<{ id: string; sessionConfirmed: boolean | null }>();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const fromTrips = computed(() => accountTripsReturnPath(route.query.returnTo));
const previousCatalog = ref<string>();
onMounted(() => {
  const previous = router.options.history.state.back;
  if (typeof previous !== 'string' || !previous.startsWith('/catalog')) {
    return;
  }
  const source = router.resolve(previous);
  if (source.path === '/catalog' || (source.path.startsWith('/catalog/') && isResourceId(source.path.slice('/catalog/'.length)))) {
    previousCatalog.value = source.fullPath;
  }
});
const canonical = new URL('/organizers/' + encodeURIComponent(props.id), useRuntimeConfig().public.siteUrl).href;

async function readPublic<T>(suffix: string, signal: AbortSignal) {
  if (!isResourceId(props.id)) {
    throw createError({ statusCode: 404 });
  }
  return await $fetch<T>('/api/v1/users/' + encodeURIComponent(props.id) + suffix, {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    retry: 0,
  });
}

const identity = usePublicResource('public-organizer-' + props.id, signal => readPublic<PublicIdentityProfile>('', signal), { live: false });
const summary = usePublicResource('public-organizer-overview-' + props.id, signal => readPublic<PublicProfileOverview>('/overview', signal), { live: false });
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
const viewer = computed(() => props.sessionConfirmed ? member.value?.id : undefined);
const visit = useVisitingProfile(computed(() => props.id.toLowerCase()), viewer);
const profile = computed(() => visit.data.value?.profile ?? identity.value.value);
const overview = computed(() => visit.data.value?.overview ?? summary.value.value);
const overviewStatus = computed(() => visit.status.value ?? (visit.data.value ? 200 : summary.status.value));
const publicError = computed(() => {
  if (identity.status.value && identity.status.value !== 200) {
    return identity.status.value;
  }
  if (summary.status.value === 404 || summary.status.value === 410) {
    return summary.status.value;
  }
  return undefined;
});
const profileError = computed(() => {
  if (visit.status.value === 404 || visit.status.value === 410) {
    return visit.status.value;
  }
  return visit.data.value ? undefined : publicError.value;
});
function retry() {
  if (viewer.value) {
    void visit.refresh();
  }
  if (!viewer.value || publicError.value) {
    identity.refresh();
    summary.refresh();
  }
}
const showAchievements = computed(() => !overview.value || Boolean(overview.value.level || overview.value.achievements?.length));
const visible = computed(() => publicError.value ? null : identity.value.value);
const title = computed(() => visible.value?.display_name ?? t('catalog.profileUnavailable'));
useSeoMeta({
  title: () => t('pageTitle', { title: title.value }),
  description: () => visible.value?.bio ?? undefined,
  robots: () => visible.value ? 'index,follow' : 'noindex,nofollow',
  ogTitle: () => visible.value?.display_name,
  ogUrl: () => visible.value ? canonical : undefined,
  ogDescription: () => visible.value?.bio ?? undefined,
});
useHead(() => ({ link: visible.value ? [{ rel: 'canonical', href: canonical }] : [] }));
if (import.meta.server) {
  await Promise.all([identity.ready, summary.ready]);
  if (publicError.value) {
    setResponseStatus(publicError.value);
  }
}
</script>

<template>
  <CatalogFrame :session-confirmed="sessionConfirmed">
    <article
      class="public-profile-panel workspace-page-panel"
      :data-scroll-pending="identity.pending.value || summary.pending.value || visit.pending.value || undefined"
      data-scroll-region="organizer-panel"
    >
      <div v-if="profileError" class="public-profile-issue">
        <SystemErrorState
          compact
          heading="h1"
          :status-code="profileError"
          :title="profileError === 404 || profileError === 410 ? t('catalog.profileUnavailable') : t('profileOverview.profileError')"
        >
          <button
            v-if="canRetryRead(profileError)"
            class="tk-button"
            :disabled="identity.pending.value || visit.pending.value"
            type="button"
            @click="retry"
          >{{ t('catalog.retry') }}</button>
        </SystemErrorState>
      </div>
      <TravelerProfileLayout v-else :single="!showAchievements">
        <template #personal>
          <header v-if="profile" class="public-profile-header">
            <UiAvatar :name="profile.display_name" :src="profile.avatar?.url" />
            <div>
              <h1>{{ profile.display_name }}</h1>
              <TravelerRating v-if="overview" :rating="overview.rating" />
              <UiSkeleton v-else-if="!overviewStatus" class="public-rating-placeholder" />
            </div>
          </header>
          <div
            v-else
            :aria-label="t('catalog.loadingProfile')"
            class="public-profile-header"
            role="status"
          >
            <UiSkeleton class="public-avatar-placeholder" />
            <UiSkeleton class="public-name-placeholder" />
          </div>
          <p v-if="profile?.bio" class="public-profile-bio">{{ profile.bio }}</p>
          <ProfileTripStats v-if="overview?.trips || !overviewStatus" :trips="overview?.trips ?? undefined" visitor />
        </template>
        <div v-if="overviewStatus && overviewStatus !== 200" class="public-profile-issue">
          <SystemErrorState compact :status-code="overviewStatus" :title="t('profileOverview.overviewError')">
            <button
              v-if="canRetryRead(overviewStatus)"
              class="tk-button"
              :disabled="summary.pending.value || visit.pending.value"
              type="button"
              @click="retry"
            >{{ t('catalog.retry') }}</button>
          </SystemErrorState>
        </div>
        <ProfileAchievements v-else-if="showAchievements" :overview="overview ?? undefined" visitor />
      </TravelerProfileLayout>
      <footer class="public-profile-footer">
        <UiBackLink class="tk-button" :to="fromTrips ?? previousCatalog ?? '/catalog'">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m10 5-7 7 7 7M3 12h18" /></svg>
          {{ t(fromTrips ? 'workspace.trips' : 'catalog.title') }}
        </UiBackLink>
      </footer>
    </article>
  </CatalogFrame>
</template>

<style scoped>
.public-profile-panel { --profile-pad: clamp(1rem, 2.15vw, 2rem); display: flex; flex-direction: column; min-inline-size: 0; background: var(--tk-surface); }
.catalog-frame .public-profile-panel { margin: clamp(.65rem, 1.8vw, 1.6rem); block-size: calc(100dvh - 64px - 2 * clamp(.65rem, 1.8vw, 1.6rem)); }
.public-profile-header { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--tk-space-4); }
.public-profile-header > div { display: grid; gap: var(--tk-space-2); }
.public-profile-header h1 { margin: 0; color: var(--tk-ink); font-size: clamp(1.35rem, 2.1vw, 1.9rem); font-weight: 700; line-height: 1.18; overflow-wrap: anywhere; }
.public-profile-header :deep(.tk-avatar), .public-avatar-placeholder { inline-size: clamp(4.25rem, 7.5vw, 6rem); block-size: auto; aspect-ratio: 1; border-radius: 50%; }
.public-name-placeholder { inline-size: min(85%, 16rem); block-size: 1.75rem; }
.public-rating-placeholder { inline-size: min(100%, 11rem); }
.public-profile-bio { margin: 0; color: var(--tk-muted); line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere; }
.public-profile-issue { flex: 1; display: grid; align-content: safe center; justify-items: center; min-inline-size: 0; }
.public-profile-panel > .public-profile-issue { padding: var(--profile-pad); }
.public-profile-footer { display: flex; flex: none; padding: var(--tk-space-3) var(--profile-pad); border-block-start: 1px solid var(--tk-line); }
.public-profile-footer svg { inline-size: 1rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.75; }
@media (max-width: 699px) {
  .catalog-frame .public-profile-panel { margin: 0; block-size: calc(100dvh - 56px); }
}
</style>
