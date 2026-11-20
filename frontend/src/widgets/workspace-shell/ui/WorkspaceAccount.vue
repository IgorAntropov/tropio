<script setup lang="ts">
import { identityApi, useIdentityAction } from '@fsd/shared/api'
import { guestHome, workspaceConfirmedKey, workspaceMemberKey } from '@fsd/shared/session'
import type { WorkspaceMember } from '@fsd/shared/session'
import { UiAvatar } from '@fsd/shared/ui/kit'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null)
const confirmed = useState(workspaceConfirmedKey, () => false)
const menu = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const expanded = ref(false)
const { pending, message, problem, reset, run } = useIdentityAction()

function closeFromOutside(event: Event) {
  if (expanded.value && event.target instanceof Node && !menu.value?.contains(event.target)) {
    expanded.value = false
  }
}

function closeWithEscape(event: KeyboardEvent) {
  if (!expanded.value) return
  event.preventDefault()
  event.stopPropagation()
  expanded.value = false
  trigger.value?.focus()
}

function toggle() {
  expanded.value = !expanded.value
  if (expanded.value) trigger.value?.focus({ preventScroll: true })
}

async function logout() {
  const signedOut = await run(async (signal) => {
    const current = await identityApi.me(signal)
    await identityApi.logout(current.csrf_token, signal)
  }, () => { expanded.value = false })
  if (signedOut || (problem.value?.status === 401 && problem.value.code === 'SESSION_REQUIRED')) {
    member.value = null
    confirmed.value = false
    await router.replace(guestHome)
  }
}

watch(() => route.path, () => {
  expanded.value = false
  reset()
})

onMounted(() => {
  document.addEventListener('pointerdown', closeFromOutside)
  document.addEventListener('focusin', closeFromOutside)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeFromOutside)
  document.removeEventListener('focusin', closeFromOutside)
})
</script>

<template>
  <div ref="menu" class="workspace-account" @keydown.esc="closeWithEscape">
    <button
      ref="trigger"
      class="workspace-account-trigger"
      type="button"
      :aria-label="t('workspace.accountMenu')"
      :aria-expanded="expanded"
      aria-controls="workspace-account-panel"
      @click="toggle"
    >
      <UiAvatar v-if="member" :name="member.display_name" :src="member.avatar?.url" aria-hidden="true" />
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" aria-hidden="true">
        <path d="M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM5 20v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1Z" />
      </svg>
    </button>
    <div v-show="expanded" id="workspace-account-panel" class="workspace-account-panel">
      <div class="workspace-account-summary">
        <strong>{{ member?.display_name || t('identity.loading') }}</strong>
        <span class="workspace-account-rating">{{ t('workspace.ratingUnavailable') }}</span>
      </div>
      <NuxtLink class="workspace-account-action" to="/profile" @click="expanded = false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" aria-hidden="true">
          <path d="M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM5 20v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1Z" />
        </svg>
        {{ t('workspace.profile') }}
      </NuxtLink>
      <button class="workspace-account-action" type="button" :disabled="pending" @click="logout">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10 4H5v16h5m3-13 5 5-5 5m-4-5h9" />
        </svg>
        {{ t(pending ? 'identity.working' : 'identity.logout') }}
      </button>
      <p v-if="message" class="workspace-account-error" role="alert">{{ t(message) }}</p>
    </div>
  </div>
</template>
