<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';
import {
  editorApi,
  EditorResponseError,
  identityApi,
  IdentityResponseError,
} from '@fsd/shared/api';
import {
  workspaceMemberKey,
  workspaceReloadNoticeKey,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';

const props = defineProps<{ tripId: string; title: string; saved: boolean }>();
const emit = defineEmits<{ changed: [saved: boolean] }>();
const { t } = useI18n();
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
const reloadNotice = useState<string | null>(workspaceReloadNoticeKey, () => null);
const busy = ref(false);
const issue = ref('');
let request: AbortController | undefined;
const caption = computed(() => t(props.saved ? 'accountTrips.removeFavorite' : 'accountTrips.addFavorite', { title: props.title }));

function reloadSession() {
  if (!reloadNotice.value) {
    reloadNotice.value = t('tripDrafts.accountChanged');
    window.location.reload();
  }
}

async function favorite() {
  const owner = member.value?.id;
  if (!owner || busy.value) {
    return;
  }
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const { signal } = controller;
  busy.value = true;
  issue.value = '';
  try {
    const profile = await identityApi.me(signal);
    signal.throwIfAborted();
    if (profile.id !== owner) {
      reloadSession();
      return;
    }
    const next = await editorApi.setTripFavorite(props.tripId, !props.saved, { csrf: profile.csrf_token, signal });
    signal.throwIfAborted();
    if (next.viewer_id !== owner || member.value?.id !== owner) {
      reloadSession();
      return;
    }
    emit('changed', next.saved);
  }
  catch (error) {
    if (!signal.aborted) {
      const apiError = error instanceof IdentityResponseError || error instanceof EditorResponseError;
      if (apiError && (error.status === 401 || error.code === 'CSRF_REJECTED')) {
        reloadSession();
      }
      else {
        issue.value = 'accountTrips.favoriteError';
      }
    }
  }
  finally {
    if (!signal.aborted) {
      busy.value = false;
    }
  }
}

watch(() => [props.tripId, props.saved, member.value?.id] as const, () => {
  request?.abort();
  busy.value = false;
  issue.value = '';
}, { immediate: true });
onBeforeUnmount(() => request?.abort());
</script>

<template>
  <div v-if="member" class="trip-favorite">
    <button
      :aria-busy="busy"
      :aria-label="caption"
      :aria-pressed="saved"
      class="tk-button trip-favorite-control"
      :disabled="busy"
      :title="caption"
      type="button"
      @click="favorite"
    >
      <svg
        aria-hidden="true"
        fill="var(--tk-raised)"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.7"
        viewBox="0 0 24 24"
      >
        <path d="M20.7 4.9a5.3 5.3 0 0 0-7.5 0L12 6.1l-1.2-1.2a5.3 5.3 0 0 0-7.5 7.5L12 21l8.7-8.6a5.3 5.3 0 0 0 0-7.5Z" />
      </svg>
    </button>
    <p v-if="issue" class="tk-field-error" role="alert">{{ t(issue) }}</p>
  </div>
</template>

<style scoped>
.trip-favorite { position: absolute; z-index: 2; inset-block-start: 0; inset-inline-end: 0; }
.trip-favorite .trip-favorite-control { display: grid; place-items: center; inline-size: var(--tk-target); block-size: var(--tk-target); padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--tk-success); }
.trip-favorite svg { display: block; inline-size: 1rem; block-size: 1rem; filter: drop-shadow(0 0 1px white) drop-shadow(0 1px 1px rgb(255 255 255 / 85%)); }
.trip-favorite-control[aria-pressed="true"] svg { fill: currentColor; }
.trip-favorite-control:hover:not(:disabled) { background: transparent; }
.trip-favorite-control:hover:not(:disabled) svg { transform: scale(1.1); }
.trip-favorite p { position: absolute; z-index: 1; inset-inline-start: 0; min-inline-size: 10rem; max-inline-size: 13rem; margin: 0; padding: var(--tk-space-2); border: 1px solid var(--tk-line); border-radius: var(--tk-radius); background: var(--tk-surface); }
</style>
