<script setup lang="ts">
import { LogoutConfirmation } from '@fsd/features/confirm-logout';
import {
  identityApi,
  IdentityResponseError,
  useIdentityAction,
} from '@fsd/shared/api';
import {
  guestHome,
  workspaceMemberKey,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';
import { UiAvatar } from '@fsd/shared/ui/kit';
import WorkspaceAccountRating from './WorkspaceAccountRating.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
const menu = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const expanded = ref(false);
const confirmingLogout = ref(false);
const { pending, message, reset, run } = useIdentityAction();

function closeFromOutside(event: Event) {
  if (expanded.value && event.target instanceof Node && !menu.value?.contains(event.target)) {
    expanded.value = false;
  }
}

function closeWithEscape(event: KeyboardEvent) {
  if (!expanded.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  expanded.value = false;
  trigger.value?.focus();
}

function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value) {
    trigger.value?.focus({ preventScroll: true });
  }
}

function requestLogout() {
  expanded.value = false;
  reset();
  trigger.value?.focus({ preventScroll: true });
  confirmingLogout.value = true;
}

async function logout() {
  await run(async (signal) => {
    try {
      const current = await identityApi.me(signal);
      await identityApi.logout(current.csrf_token, signal);
    }
    catch (error) {
      if (!(error instanceof IdentityResponseError && error.status === 401 && error.code === 'SESSION_REQUIRED')) {
        throw error;
      }
    }
    await router.replace(guestHome);
  }, () => {
    confirmingLogout.value = false;
  });
}

watch(() => route.path, () => {
  expanded.value = false;
  confirmingLogout.value = false;
  reset();
});

onMounted(() => {
  document.addEventListener('pointerdown', closeFromOutside);
  document.addEventListener('focusin', closeFromOutside);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeFromOutside);
  document.removeEventListener('focusin', closeFromOutside);
});
</script>

<template>
  <div ref="menu" class="workspace-account" @keydown.esc="closeWithEscape">
    <button
      ref="trigger"
      aria-controls="workspace-account-panel"
      :aria-expanded="expanded"
      :aria-label="t('workspace.accountMenu')"
      class="workspace-account-trigger"
      type="button"
      @click="toggle"
    >
      <UiAvatar
        v-if="member"
        aria-hidden="true"
        :name="member.display_name"
        :src="member.avatar?.url"
      />
      <svg
        v-else
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="1.65"
        viewBox="0 0 24 24"
      >
        <path d="M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM5 20v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1Z" />
      </svg>
    </button>
    <div v-show="expanded" id="workspace-account-panel" class="workspace-account-panel">
      <div class="workspace-account-summary">
        <strong>{{ member?.display_name || t('identity.loading') }}</strong>
        <WorkspaceAccountRating v-if="member" :active="expanded" />
      </div>
      <NuxtLink class="workspace-account-action" to="/profile" @click="expanded = false">
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.65"
          viewBox="0 0 24 24"
        >
          <path d="M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM5 20v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1Z" />
        </svg>
        {{ t('workspace.profile') }}
      </NuxtLink>
      <button
        aria-haspopup="dialog"
        class="workspace-account-action"
        type="button"
        @click="requestLogout"
      >
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.65"
          viewBox="0 0 24 24"
        >
          <path d="M10 4H5v16h5m3-13 5 5-5 5m-4-5h9" />
        </svg>
        {{ t('identity.logout') }}
      </button>
    </div>
    <LogoutConfirmation
      v-model="confirmingLogout"
      :error="message ? t(message) : undefined"
      :pending="pending"
      @confirm="logout"
    />
  </div>
</template>
