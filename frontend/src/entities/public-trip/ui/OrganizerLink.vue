<script setup lang="ts">
import type { PublicIdentityProfile } from '@fsd/shared/api';
import {
  workspaceConfirmedKey,
  workspaceMemberKey,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';
import { UiAvatar } from '@fsd/shared/ui/kit';
const props = defineProps<{ organizer: Pick<PublicIdentityProfile, 'id' | 'display_name' | 'avatar'>; compact?: boolean; self?: boolean; returnTo?: string }>();
const { t } = useI18n();
const link = resolveComponent('NuxtLink');
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
const confirmed = useState<boolean | null>(workspaceConfirmedKey, () => null);
const checkingSession = computed(() => confirmed.value !== false && !member.value);
const profileLink = computed(() => {
  if (props.self || props.organizer.id === member.value?.id) {
    return;
  }
  return { path: '/organizers/' + props.organizer.id, query: props.returnTo ? { returnTo: props.returnTo } : undefined };
});
const interactive = computed(() => !!profileLink.value && !checkingSession.value);
function stopCardClick(event: MouseEvent) {
  event.stopPropagation();
}
</script>

<template>
  <component
    :is="interactive ? link : 'span'"
    :aria-label="interactive ? t('catalog.organizerProfile', { name: organizer.display_name }) : undefined"
    class="catalog-organizer"
    :class="{ 'catalog-organizer-compact': compact }"
    :data-checking-organizer="checkingSession || undefined"
    :title="compact ? organizer.display_name : undefined"
    v-bind="interactive ? { prefetch: false, to: profileLink } : { onClick: stopCardClick }"
  >
    <NuxtLink
      v-if="checkingSession && profileLink"
      :aria-label="t('catalog.organizerProfile', { name: organizer.display_name })"
      class="organizer-static-link"
      :prefetch="false"
      :to="profileLink"
    ><span class="tk-sr-only">{{ organizer.display_name }}</span></NuxtLink>
    <UiAvatar :name="organizer.display_name" :src="organizer.avatar?.url" />
    <span><small v-if="!compact">{{ t('catalog.organizer') }}</small><strong>{{ organizer.display_name }}</strong></span>
  </component>
</template>

<style scoped>
.catalog-organizer { position: relative; z-index: 2; display: inline-flex; align-items: center; gap: .55rem; color: var(--tk-accent); text-decoration: none; min-height: 44px; margin-top: .75rem; font-size: .9rem; }
a.catalog-organizer:is(:hover, :focus-visible) { text-decoration: underline; text-underline-offset: .18em; }
a.catalog-organizer:focus-visible { outline: 2px solid var(--tk-focus); outline-offset: 2px; }
.catalog-organizer > span:last-child { min-width: 0; }
.catalog-organizer small, .catalog-organizer strong { display: block; overflow-wrap: anywhere; }
.catalog-organizer small { color: var(--tk-muted); }
.catalog-organizer-compact { margin: 0; gap: .4rem; font-size: .78rem; }
.catalog-organizer-compact :deep(.tk-avatar) { --tk-avatar-size: 1.4rem; width: 1.4rem; height: 1.4rem; flex-shrink: 0; }
.catalog-organizer-compact :deep(.tk-avatar-image) { font-size: .64rem; }
.organizer-static-link { position: absolute; inset: 0; z-index: 1; }
@media (scripting: enabled) {
  .organizer-static-link { display: none; }
}
</style>
