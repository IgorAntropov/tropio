<script setup lang="ts">
import { identityApi, useIdentityAction } from '@fsd/shared/api'
import type { IdentityProfile, SystemAvatar } from '@fsd/shared/api'
import { workspaceMemberKey, workspaceMemberOf } from '@fsd/shared/session'
import type { WorkspaceMember } from '@fsd/shared/session'
import { AccountPanel } from '@fsd/shared/ui/account-panel'
import { hasInvalidText, useFormValidation } from '@fsd/shared/ui/form'
import { UiAvatar, UiStatus, UiTextField } from '@fsd/shared/ui/kit'

const { t } = useI18n()
const profile = shallowRef<IdentityProfile>()
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null)
const assets = shallowRef<SystemAvatar[]>()
const name = ref('')
const bio = ref('')
const editingAvatar = ref(false)
const selectedId = ref('')
const feedback = ref('')
const avatarHeading = ref<HTMLHeadingElement>()
const avatarOpener = ref<HTMLButtonElement>()

const loadProfile = useIdentityAction()
const loadAssets = useIdentityAction()
const save = useIdentityAction()
const { pending, message, problem: saveProblem } = save
const { pending: loadingProfile, message: profileError, problem: profileProblem } = loadProfile
const { pending: loadingAssets, message: assetsError } = loadAssets

const signInNeeded = computed(() => profileProblem.value?.status === 401 && profileProblem.value.code === 'SESSION_REQUIRED')
const sessionExpired = computed(() => saveProblem.value?.status === 401 && saveProblem.value.code === 'SESSION_REQUIRED')
const hasEdits = computed(() => name.value.trim() !== profile.value?.display_name || (bio.value || null) !== profile.value?.bio)
const { valid, errors, touch, reset: resetValidation } = useFormValidation({
  name: () => {
    const value = name.value.trim()
    if (!value) return t('identity.profile.nameError')
    if (hasInvalidText(value)) return t('identity.profile.invalidText')
    if ([...value].length > 80) return t('identity.profile.nameMaxError')
  },
  bio: () => {
    if (hasInvalidText(bio.value)) return t('identity.profile.invalidText')
    if ([...bio.value].length > 1000) return t('identity.profile.bioMaxError')
  },
})
const avatar = computed(() => editingAvatar.value
  ? assets.value?.find(item => item.id === selectedId.value) ?? profile.value?.avatar
  : profile.value?.avatar)
const avatarChanged = computed(() => avatar.value?.id !== profile.value?.avatar?.id)
const pageTitle = computed(() => t(editingAvatar.value ? 'identity.profile.avatarTitle' : 'identity.profile.title'))

useHead(() => ({
  title: t('pageTitle', { title: pageTitle.value }),
  meta: [{ name: 'robots', content: 'noindex' }],
}))

onMounted(reloadProfile)

function resetFields() {
  name.value = profile.value?.display_name ?? ''
  bio.value = profile.value?.bio ?? ''
  resetValidation()
}

async function reloadProfile() {
  await loadProfile.run(identityApi.me, (result) => {
    applyProfile(result)
    resetFields()
  })
}

function applyProfile(result: IdentityProfile) {
  profile.value = result
  member.value = workspaceMemberOf(result)
}

async function reloadAssets() {
  await loadAssets.run(identityApi.avatarAssets, (result) => { assets.value = result.items })
}

async function openAvatars() {
  selectedId.value = profile.value?.avatar?.id ?? ''
  editingAvatar.value = true
  feedback.value = ''
  save.reset()
  await nextTick()
  avatarHeading.value?.focus()
  await reloadAssets()
}

async function closeAvatars() {
  editingAvatar.value = false
  save.reset()
  await nextTick()
  avatarOpener.value?.focus()
}

function cancelProfile() {
  resetFields()
  feedback.value = ''
  save.reset()
}

async function saveProfile() {
  const current = profile.value
  if (!current || pending.value || !hasEdits.value || !valid.value) return
  save.reset()
  feedback.value = ''
  const displayName = name.value.trim()
  await save.run(signal => identityApi.updateProfile({
    display_name: displayName,
    bio: bio.value || null,
  }, current.csrf_token, signal), (result) => {
    applyProfile(result)
    resetFields()
    feedback.value = 'identity.profile.saved'
  })
}

async function saveAvatar() {
  const current = profile.value
  const chosen = avatar.value
  if (!current || !chosen || !avatarChanged.value || pending.value || loadingAssets.value) return
  const saved = await save.run(signal => identityApi.selectAvatar({
    avatar_id: chosen.id,
  }, current.csrf_token, signal), applyProfile)
  if (saved) {
    feedback.value = 'identity.profile.avatarSaved'
    await closeAvatars()
  }
}
</script>

<template>
  <AccountPanel :title="pageTitle" wide>
    <div v-if="!profile" class="account-form">
      <UiStatus v-if="loadingProfile || !profileError" tone="pending">{{ t('identity.loading') }}</UiStatus>
      <template v-else-if="signInNeeded">
        <p class="account-notice">{{ t('identity.errors.sessionRequired') }}</p>
        <nav class="account-links" :aria-label="t('identity.navigation')">
          <NuxtLink to="/login">{{ t('identity.login.submit') }}</NuxtLink>
          <NuxtLink to="/register">{{ t('identity.register.submit') }}</NuxtLink>
        </nav>
      </template>
      <template v-else>
        <p class="account-notice account-notice-error" role="alert">{{ t(profileError) }}</p>
        <button class="tk-button" type="button" @click="reloadProfile">{{ t('identity.retry') }}</button>
      </template>
    </div>
    <template v-else>
      <form v-if="!editingAvatar" class="account-form" novalidate :aria-busy="pending" @submit.prevent="saveProfile">
        <div class="profile-grid">
          <div class="account-form">
            <UiTextField
              v-model="name" :label="t('identity.profile.name')" name="display-name" autocomplete="nickname"
              :maxlength="160" :error="errors.name" :disabled="pending" required
              @blur="touch('name')"
            />
            <UiTextField
              v-model="bio" :label="t('identity.profile.bio')" name="bio" :rows="4" :maxlength="2000"
              :error="errors.bio" :disabled="pending" @blur="touch('bio')"
            />
          </div>
          <section class="profile-preview" :aria-label="t('identity.profile.preview')">
            <h2>{{ t('identity.profile.preview') }}</h2>
            <div class="profile-preview-heading">
              <UiAvatar :name="name || profile.display_name" :src="avatar?.url" />
              <strong>{{ name || profile.display_name }}</strong>
            </div>
            <p v-if="bio" class="profile-text">{{ bio }}</p>
            <button ref="avatarOpener" class="tk-button" type="button" :disabled="pending" @click="openAvatars">
              {{ t('identity.profile.changeAvatar') }}
            </button>
          </section>
        </div>
        <p v-if="message" class="account-notice account-notice-error" role="alert">{{ t(message) }}</p>
        <NuxtLink v-if="sessionExpired" to="/login">{{ t('identity.login.submit') }}</NuxtLink>
        <footer class="profile-footer">
          <UiStatus v-if="feedback" tone="success">{{ t(feedback) }}</UiStatus>
          <div class="account-actions">
            <button class="tk-button" type="button" :disabled="pending || !hasEdits" @click="cancelProfile">{{ t('identity.cancel') }}</button>
            <button class="tk-button tk-button-primary" type="submit" :disabled="pending || !hasEdits || !valid">
              {{ t(pending ? 'identity.working' : 'identity.save') }}
            </button>
          </div>
        </footer>
      </form>
      <form v-else class="account-form" :aria-busy="pending || loadingAssets" @submit.prevent="saveAvatar">
        <section class="profile-preview">
          <h2 ref="avatarHeading" tabindex="-1">{{ t(avatarChanged ? 'identity.profile.avatarPreview' : 'identity.profile.currentAvatar') }}</h2>
          <div class="profile-preview-heading">
            <UiAvatar :name="profile.display_name" :src="avatar?.url" />
            <strong>{{ profile.display_name }}</strong>
          </div>
        </section>
        <UiStatus v-if="loadingAssets || (!assets && !assetsError)" tone="pending">{{ t('identity.loading') }}</UiStatus>
        <div v-else-if="assetsError" class="account-form">
          <p class="account-notice account-notice-error" role="alert">{{ t(assetsError) }}</p>
          <button class="tk-button" type="button" @click="reloadAssets">{{ t('identity.retry') }}</button>
        </div>
        <fieldset v-else-if="assets?.length" class="profile-avatar-fieldset" :disabled="pending">
          <legend>{{ t('identity.profile.avatars') }}</legend>
          <div class="profile-avatar-options">
            <label v-for="(item, index) in assets" :key="item.id" class="profile-avatar-option">
              <input v-model="selectedId" class="tk-sr-only" type="radio" name="avatar" :value="item.id">
              <span class="tk-sr-only">{{ t('identity.profile.avatarChoice', { number: index + 1 }) }}</span>
              <span aria-hidden="true">
                <UiAvatar :name="t('identity.profile.avatarChoice', { number: index + 1 })" :src="item.url" />
              </span>
            </label>
          </div>
        </fieldset>
        <p v-else class="account-notice">{{ t('identity.profile.noAvatars') }}</p>
        <p v-if="message" class="account-notice account-notice-error" role="alert">{{ t(message) }}</p>
        <NuxtLink v-if="sessionExpired" to="/login">{{ t('identity.login.submit') }}</NuxtLink>
        <footer class="profile-footer">
          <div class="account-actions">
            <button class="tk-button" type="button" :disabled="pending" @click="closeAvatars">{{ t('identity.cancel') }}</button>
            <button class="tk-button tk-button-primary" type="submit" :disabled="pending || loadingAssets || !avatarChanged">
              {{ t(pending ? 'identity.working' : 'identity.save') }}
            </button>
          </div>
        </footer>
      </form>
    </template>
  </AccountPanel>
</template>

<style scoped>
.profile-grid {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: var(--tk-space-4);
  align-items: start;
  min-inline-size: 0;
}

.profile-preview {
  display: grid;
  justify-items: start;
  gap: var(--tk-space-3);
  min-inline-size: 0;
  padding: var(--tk-space-4);
  border-radius: var(--tk-radius);
  background: var(--tk-raised);
}

.profile-preview h2 {
  margin: 0;
  color: var(--tk-muted);
  font-size: var(--tk-text-sm);
  font-weight: 600;
}

.profile-preview-heading {
  display: flex;
  gap: var(--tk-space-3);
  align-items: center;
  width: 100%;
  font-size: var(--tk-text-lg);
  overflow-wrap: anywhere;
}

.profile-preview-heading :deep(.tk-avatar) {
  flex: 0 0 auto;
}

.profile-text {
  max-inline-size: 100%;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.profile-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--tk-space-2);
  padding-block-start: var(--tk-space-4);
  border-block-start: 1px solid var(--tk-line);
}

.profile-avatar-fieldset {
  display: grid;
  gap: var(--tk-space-2);
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.profile-avatar-fieldset legend {
  padding: 0 0 var(--tk-space-2);
  font-weight: 600;
}

.profile-avatar-options {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--tk-space-2);
}

.profile-avatar-option {
  position: relative;
  display: grid;
  place-items: center;
  min-inline-size: 0;
  min-block-size: var(--tk-target);
  aspect-ratio: 1;
  border: 1px solid var(--tk-line);
  border-radius: var(--tk-radius);
  background: var(--tk-surface);
  cursor: pointer;
}

.profile-avatar-option:hover {
  background: var(--tk-raised);
}

.profile-avatar-option:has(:checked) {
  border-color: var(--tk-accent);
  background: var(--tk-selected);
  box-shadow: inset 0 0 0 1px var(--tk-accent);
}

.profile-avatar-option:has(:focus-visible) {
  outline: 2px solid var(--tk-focus);
  outline-offset: 2px;
}

.profile-avatar-option:has(:disabled) {
  cursor: wait;
}

.profile-avatar-option :deep(.tk-avatar),
.profile-avatar-option :deep(.tk-avatar-image) {
  inline-size: clamp(36px, 8vw, 54px);
  block-size: clamp(36px, 8vw, 54px);
}

@media (max-width: 540px) {
  .profile-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .profile-avatar-options {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
