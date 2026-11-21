<script setup lang="ts">
import {
  canRetryRead,
  editorApi,
  identityApi,
  readFailureStatus,
} from '@fsd/shared/api';
import {
  workspaceMemberKey,
  workspaceReloadNoticeKey,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';
import {
  UiAvatar,
  UiButton,
  UiDialog,
  UiSegmented,
  UiSkeleton,
} from '@fsd/shared/ui/kit';
import { SystemErrorState } from '@fsd/shared/ui/page-error';

type Roster = Awaited<ReturnType<typeof editorApi.getTripRoster>>;
type Entry = Roster['items'][number];
type Action = Parameters<typeof editorApi.updateTripRoster>[2]['action'];
const props = defineProps<{ tripId: string; revision: string }>();
const route = useRoute();
const { t } = useI18n();
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
const reloadNotice = useState<string | null>(workspaceReloadNoticeKey, () => null);
const roster = shallowRef<Roster>();
const section = ref<HTMLElement>();
const selected = ref(route.hash === '#requests' ? 'pending' : 'joined');
const pending = computed(() => roster.value?.items.filter(item => item.status === 'pending') ?? []);
const joined = computed(() => roster.value?.items.filter(item => item.status === 'joined') ?? []);
const visible = computed(() => selected.value === 'pending' ? pending.value : joined.value);
const tabs = computed(() => [
  { value: 'joined', label: t('tripRoster.members', { n: joined.value.length }) },
  { value: 'pending', label: t('tripRoster.requests', { n: pending.value.length }) },
]);
const confirmation = shallowRef<{ entry: Entry; action: 'decline' | 'remove' }>();
const dialogOpen = ref(false);
const readError = ref<number>();
const message = ref('');
const saving = ref(false);
let current: AbortController | undefined;

function displayName(entry: Entry) {
  return entry.profile?.display_name ?? t('tripRoster.anonymous');
}

function sessionChanged() {
  current?.abort();
  roster.value = undefined;
  confirmation.value = undefined;
  dialogOpen.value = false;
  message.value = '';
  reloadNotice.value = t('tripDrafts.accountChanged');
  window.location.reload();
}

async function read(signal: AbortSignal) {
  const result = await editorApi.getTripRoster(props.tripId, signal);
  const viewer = await identityApi.me(signal);
  signal.throwIfAborted();
  if (result.viewer_id !== viewer.id || viewer.id !== member.value?.id) {
    sessionChanged();
    return;
  }
  roster.value = result;
  readError.value = undefined;
}

function failedRead(error: unknown) {
  roster.value = undefined;
  readError.value = readFailureStatus(error);
  if (readError.value === 401) {
    sessionChanged();
  }
}

async function load() {
  current?.abort();
  const { signal } = current = new AbortController();
  roster.value = undefined;
  readError.value = undefined;
  saving.value = false;
  dialogOpen.value = false;
  message.value = '';
  try {
    await read(signal);
  }
  catch (error) {
    if (!signal.aborted) {
      failedRead(error);
    }
  }
}

function locateTab() {
  if (route.hash === '#members' || route.hash === '#requests') {
    selected.value = route.hash === '#requests' ? 'pending' : 'joined';
    section.value?.scrollIntoView({ block: 'start' });
  }
}

async function decide(entry: Entry, action: Action) {
  if (saving.value || !roster.value?.can_manage) {
    return;
  }
  const { signal } = current = new AbortController();
  saving.value = true;
  dialogOpen.value = false;
  message.value = '';
  try {
    const viewer = await identityApi.me(signal);
    signal.throwIfAborted();
    if (viewer.id !== member.value?.id || viewer.id !== roster.value.viewer_id) {
      sessionChanged();
      return;
    }
    await editorApi.updateTripRoster(props.tripId, entry.id, { action }, { csrf: viewer.csrf_token, signal });
    message.value = t(`tripRoster.result.${action}`, { name: displayName(entry) });
  }
  catch (error) {
    if (!signal.aborted) {
      message.value = t(readFailureStatus(error) === 409 ? 'tripRoster.changed' : 'tripRoster.writeError');
    }
  }
  finally {
    if (!signal.aborted) {
      try {
        await read(signal);
      }
      catch (error) {
        if (!signal.aborted) {
          failedRead(error);
        }
      }
      if (!signal.aborted) {
        saving.value = false;
      }
    }
  }
}

function confirm(entry: Entry, action: 'decline' | 'remove') {
  confirmation.value = { entry, action };
  dialogOpen.value = true;
}
function visibilityChanged() {
  if (document.hidden) {
    current?.abort();
    roster.value = undefined;
    confirmation.value = undefined;
    dialogOpen.value = false;
    message.value = '';
    return;
  }
  void load();
}
onMounted(() => {
  document.addEventListener('visibilitychange', visibilityChanged);
  locateTab();
  void load();
});
watch(() => route.hash, locateTab);
watch(() => [props.tripId, props.revision, member.value?.id], load);
onBeforeUnmount(() => {
  current?.abort();
  if (import.meta.client) {
    document.removeEventListener('visibilitychange', visibilityChanged);
  }
});
</script>

<template>
  <section ref="section" :aria-label="t('tripRoster.title')" class="trip-roster">
    <div class="trip-roster-heading">
      <h2>{{ t('tripRoster.title') }}</h2>
      <span v-if="roster" class="trip-roster-capacity">{{ roster.capacity === null
        ? t('tripRoster.occupied', { n: roster.occupied_slots })
        : t('tripRoster.capacity', { n: roster.occupied_slots, limit: roster.capacity }) }}</span>
    </div>
    <SystemErrorState
      v-if="readError"
      compact
      :description="t('tripRoster.readHint')"
      :status-code="readError"
      :title="t('tripRoster.readError')"
    >
      <UiButton v-if="canRetryRead(readError)" @click="load">{{ t('catalog.retry') }}</UiButton>
    </SystemErrorState>
    <div
      v-else-if="!roster"
      :aria-label="t('tripRoster.loading')"
      class="trip-roster-loading"
      role="status"
    >
      <UiSkeleton v-for="n in 2" :key="n" />
    </div>
    <template v-else>
      <UiSegmented v-model="selected" :label="t('tripRoster.title')" :options="tabs" />
      <p v-if="selected === 'pending' && pending.length && roster.can_manage && !roster.can_accept" class="trip-roster-note">
        {{ t(roster.capacity !== null && roster.occupied_slots >= roster.capacity ? 'tripRoster.full' : 'tripRoster.closed') }}
      </p>
      <ul v-if="visible.length" class="trip-roster-list">
        <li v-for="entry in visible" :key="entry.id">
          <div class="trip-roster-person">
            <UiAvatar :name="displayName(entry)" :src="entry.profile?.avatar?.url" />
            <span>{{ displayName(entry) }}</span>
          </div>
          <div v-if="roster.can_manage" class="trip-roster-actions">
            <template v-if="entry.status === 'pending'">
              <UiButton :aria-label="t('tripRoster.declineNamed', { name: displayName(entry) })" :disabled="saving" @click="confirm(entry, 'decline')">
                {{ t('tripRoster.decline') }}
              </UiButton>
              <UiButton
                :aria-label="t('tripRoster.acceptNamed', { name: displayName(entry) })"
                class="tk-button-primary"
                :disabled="saving || !roster.can_accept"
                @click="decide(entry, 'accept')"
              >{{ t('tripRoster.accept') }}</UiButton>
            </template>
            <UiButton
              v-else
              :aria-label="t('tripRoster.removeNamed', { name: displayName(entry) })"
              :disabled="saving"
              @click="confirm(entry, 'remove')"
            >
              {{ t('tripRoster.remove') }}
            </UiButton>
          </div>
        </li>
      </ul>
      <p v-else class="trip-roster-empty">{{ t(selected === 'pending' ? 'tripRoster.noRequests' : 'tripRoster.noMembers') }}</p>
    </template>
    <p v-if="message" class="trip-roster-feedback" role="status">{{ message }}</p>
    <UiDialog v-model="dialogOpen" layout="confirmation" :title="t(confirmation?.action === 'decline' ? 'tripRoster.confirmDecline' : 'tripRoster.confirmRemove')">
      <template v-if="confirmation">
        <p>{{ t(confirmation.action === 'decline' ? 'tripRoster.declineHint' : 'tripRoster.removeHint', { name: displayName(confirmation.entry) }) }}</p>
        <div class="trip-roster-actions">
          <UiButton @click="dialogOpen = false">{{ t('tripRoster.cancel') }}</UiButton>
          <UiButton class="tk-button-primary" :disabled="saving" @click="decide(confirmation.entry, confirmation.action)">{{ t(`tripRoster.${confirmation.action}`) }}</UiButton>
        </div>
      </template>
    </UiDialog>
  </section>
</template>

<style scoped>
.trip-roster { display: grid; gap: var(--tk-space-3); margin-block: var(--tk-space-5); padding: var(--tk-space-4); border: 1px solid var(--tk-line); border-radius: var(--tk-radius); background: var(--tk-surface); scroll-margin-block-start: var(--tk-space-4); }
.trip-roster-heading, .trip-roster-list li, .trip-roster-person, .trip-roster-actions { display: flex; align-items: center; gap: var(--tk-space-2); }
.trip-roster-heading, .trip-roster-list li { justify-content: space-between; flex-wrap: wrap; }
.trip-roster-heading h2, .trip-roster p { margin: 0; }
.trip-roster-capacity, .trip-roster-note, .trip-roster-empty, .trip-roster-feedback { color: var(--tk-muted); font-size: var(--tk-text-sm); }
.trip-roster :deep(.tk-segmented) { justify-self: start; max-inline-size: 100%; }
.trip-roster-list { list-style: none; margin: 0; padding: 0; }
.trip-roster-list li { border-block-start: 1px solid var(--tk-line); padding-block: var(--tk-space-2); }
.trip-roster-list li:last-child { padding-block-end: 0; }
.trip-roster-person { min-inline-size: 0; font-weight: 650; }
.trip-roster-person :deep(.tk-avatar) { inline-size: 2rem; block-size: 2rem; flex-shrink: 0; }
.trip-roster-actions { flex-wrap: wrap; justify-content: flex-end; }
.trip-roster-empty { padding-block: var(--tk-space-2); }
.trip-roster-loading { display: grid; gap: var(--tk-space-2); }
.trip-roster-loading > span { block-size: var(--tk-target); }
@media (max-width: 35rem) {
  .trip-roster-list li { align-items: start; flex-direction: column; }
  .trip-roster-actions { max-width: 100%; }
}
</style>
