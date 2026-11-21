<script setup lang="ts">
import {
  ProfileAchievements,
  ProfileTripStats,
  TravelerProfileLayout,
  TravelerRating,
  useAccountOverview,
  useAccountSessionRecovery,
} from '@fsd/entities/traveler';
import {
  browserSession,
  identityApi,
  useIdentityAction,
} from '@fsd/shared/api';
import type {
  IdentityProfile,
  SystemAvatar,
} from '@fsd/shared/api';
import {
  imagePreview,
  useImageFile,
} from '@fsd/shared/image-file';
import type { ImageUpload } from '@fsd/shared/image-file';
import {
  workspaceMemberKey,
  workspaceMemberOf,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';
import {
  hasInvalidText,
  useFormValidation,
} from '@fsd/shared/ui/form';
import {
  UiAvatar,
  UiSkeleton,
  UiStatus,
  UiTextField,
} from '@fsd/shared/ui/kit';
import { MaterialSymbol } from '@fsd/shared/ui/material-symbol';
import { SystemErrorState } from '@fsd/shared/ui/page-error';
import { WorkspacePage } from '@fsd/shared/ui/workspace-page/index';
import ProfileAvatarPicker from './ProfileAvatarPicker.vue';
import '@fsd/shared/ui/account-panel/account-form.css';

const { t } = useI18n();
const { overview, error: overviewError, reload: reloadOverview } = useAccountOverview();
const recoverSession = useAccountSessionRecovery();
const profile = shallowRef<IdentityProfile>();
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
const assets = shallowRef<SystemAvatar[]>();
const name = ref('');
const bio = ref('');
const editingAvatar = ref(false);
const selectedId = ref('');
const feedback = ref('');
const picker = useTemplateRef('picker');
const avatarPanelId = useId();
const photo = shallowRef<ImageUpload>();
const removedPhotoId = ref('');
const file = useImageFile();
const { loading: reading, error: fileError } = file;
const avatarOpener = ref<HTMLButtonElement>();

const loadProfile = useIdentityAction();
const loadAssets = useIdentityAction();
const save = useIdentityAction();
const { pending, message, problem: saveProblem } = save;
const { pending: loadingProfile, message: profileError, problem: profileProblem } = loadProfile;
const { message: assetsError } = loadAssets;

const signInNeeded = computed(() => profileProblem.value?.status === 401 && profileProblem.value.code === 'SESSION_REQUIRED');
const sessionExpired = computed(() => saveProblem.value?.status === 401 && saveProblem.value.code === 'SESSION_REQUIRED');
watch([signInNeeded, sessionExpired], ([readExpired, writeExpired]) => {
  if (readExpired || writeExpired) {
    recoverSession();
  }
});

const { valid, errors, touch, reset: resetValidation } = useFormValidation({
  name: () => {
    const value = name.value.trim();
    if (!value) {
      return t('identity.profile.nameError');
    }
    if (hasInvalidText(value)) {
      return t('identity.profile.invalidText');
    }
    if ([...value].length > 80) {
      return t('identity.profile.nameMaxError');
    }
  },
  bio: () => {
    if (hasInvalidText(bio.value)) {
      return t('identity.profile.invalidText');
    }
    if ([...bio.value].length > 1000) {
      return t('identity.profile.bioMaxError');
    }
  },
});
const customOptions = computed(() => {
  const options = [];
  const current = profile.value?.avatar;
  if (current?.url.startsWith('/api/v1/users/') && current.id !== removedPhotoId.value) {
    options.push({ ...current, label: t('identity.profile.currentAvatar') });
  }
  if (photo.value) {
    options.push({ id: 'upload', url: imagePreview(photo.value), label: t('identity.profile.customPhoto') });
  }
  return options;
});
const previewId = computed(() => selectedId.value || (removedPhotoId.value ? assets.value?.[0]?.id : '') || '');
const avatarUrl = computed(() => customOptions.value.find(item => item.id === previewId.value)?.url
  ?? assets.value?.find(item => item.id === previewId.value)?.url
  ?? (removedPhotoId.value ? undefined : profile.value?.avatar?.url));
const changedAvatar = computed(() => {
  if (!selectedId.value && removedPhotoId.value) {
    return { remove_custom_id: removedPhotoId.value };
  }
  if (!selectedId.value || selectedId.value === profile.value?.avatar?.id) {
    return;
  }
  return selectedId.value === 'upload' ? photo.value : { avatar_id: selectedId.value };
});
const hasEdits = computed(() => !!changedAvatar.value || name.value.trim() !== profile.value?.display_name || (bio.value || null) !== profile.value?.bio);
if (browserSession) {
  watch(browserSession.profile, (current) => {
    if (current && current.id === profile.value?.id && !hasEdits.value && !reading.value && !pending.value) {
      profile.value = current;
      resetFields();
    }
  });
}
const canSave = computed(() => profile.value && !pending.value && hasEdits.value && valid.value && !fileError.value && !reading.value);
const pageTitle = computed(() => t('identity.profile.title'));

useHead(() => ({
  title: t('pageTitle', { title: pageTitle.value }),
  meta: [{ name: 'robots', content: 'noindex' }],
}));

onMounted(reloadProfile);

function resetFields() {
  name.value = profile.value?.display_name ?? '';
  bio.value = profile.value?.bio ?? '';
  selectedId.value = profile.value?.avatar?.id ?? '';
  removedPhotoId.value = '';
  photo.value = undefined;
  file.reset();
  resetValidation();
}

async function reloadProfile() {
  await loadProfile.run(identityApi.me, (result) => {
    applyProfile(result);
    resetFields();
  });
}

function applyProfile(result: IdentityProfile) {
  if (member.value && member.value.id !== result.id) {
    recoverSession();
    return;
  }
  profile.value = result;
  member.value = workspaceMemberOf(result);
}

async function reloadAssets() {
  await loadAssets.run(identityApi.avatarAssets, (result) => {
    assets.value = result.items;
  });
}

async function toggleAvatars(event: MouseEvent) {
  if (editingAvatar.value) {
    closeAvatars();
    return;
  }
  editingAvatar.value = true;
  if (!assets.value) {
    void reloadAssets();
  }
  if (event.detail === 0) {
    await nextTick();
    picker.value?.focus();
  }
}

function closeAvatars() {
  editingAvatar.value = false;
  if (fileError.value) {
    file.reset();
  }
  avatarOpener.value?.focus({ preventScroll: true });
}

function dismissAvatars(event: KeyboardEvent) {
  if (editingAvatar.value) {
    event.preventDefault();
    event.stopPropagation();
    closeAvatars();
  }
}

function selectAvatar(id: string) {
  file.reset();
  feedback.value = '';
  save.reset();
  selectedId.value = id;
}

function removePhoto(id: string) {
  if (id === 'upload') {
    photo.value = undefined;
  }
  else {
    removedPhotoId.value = id;
  }
  const fallback = removedPhotoId.value ? '' : profile.value?.avatar?.id ?? '';
  selectAvatar(selectedId.value === id ? fallback : selectedId.value);
}

async function selectFile(chosen: File) {
  feedback.value = '';
  save.reset();
  const upload = await file.read(chosen);
  if (upload) {
    photo.value = upload;
    selectedId.value = 'upload';
  }
  else if (fileError.value) {
    editingAvatar.value = true;
  }
}

function cancelProfile() {
  editingAvatar.value = false;
  const latest = browserSession?.profile.value;
  if (latest && latest.id === profile.value?.id) {
    profile.value = latest;
  }
  resetFields();
  feedback.value = '';
  save.reset();
}

async function saveProfile() {
  const current = profile.value;
  if (!current || !canSave.value) {
    return;
  }
  save.reset();
  feedback.value = '';
  const displayName = name.value.trim();
  await save.run(signal => identityApi.updateProfile({
    ...(displayName !== current.display_name && { display_name: displayName }),
    ...((bio.value || null) !== current.bio && { bio: bio.value || null }),
    ...(changedAvatar.value && { avatar: changedAvatar.value }),
  }, current.csrf_token, signal), (result) => {
    applyProfile(result);
    resetFields();
    editingAvatar.value = false;
    feedback.value = 'identity.profile.saved';
  });
}
</script>

<template>
  <WorkspacePage>
    <div class="profile-content" @keydown.esc="dismissAvatars">
      <h1 class="tk-sr-only">{{ pageTitle }}</h1>
      <TravelerProfileLayout :data-scroll-pending="(!profile && !profileError) || (!overview && !overviewError) || undefined">
        <template #personal>
          <form
            v-if="profile"
            id="personal-profile-form"
            :aria-busy="pending"
            class="profile-form account-form"
            novalidate
            @submit.prevent="saveProfile"
          >
            <div>
              <div class="profile-person">
                <button
                  ref="avatarOpener"
                  :aria-controls="avatarPanelId"
                  :aria-expanded="editingAvatar"
                  :aria-label="t(editingAvatar ? 'identity.profile.closeAvatarPicker' : 'identity.profile.changeAvatar')"
                  class="profile-avatar-button"
                  :disabled="pending"
                  :title="t(editingAvatar ? 'identity.profile.closeAvatarPicker' : 'identity.profile.changeAvatar')"
                  type="button"
                  @click="toggleAvatars"
                >
                  <UiAvatar :name="profile.display_name" :src="avatarUrl" />
                  <span aria-hidden="true" class="profile-avatar-edit">
                    <svg v-if="editingAvatar" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" /></svg>
                    <MaterialSymbol v-else name="edit" />
                  </span>
                </button>
                <div class="profile-name">
                  <UiTextField
                    v-model="name"
                    autocomplete="nickname"
                    :disabled="pending"
                    :error="errors.name"
                    :label="t('identity.profile.name')"
                    :maxlength="160"
                    name="display-name"
                    required
                    @blur="touch('name')"
                  />
                  <TravelerRating v-if="overview" :rating="overview.rating" />
                  <UiSkeleton v-else-if="!overviewError" class="profile-rating-skeleton" />
                </div>
              </div>
              <div
                :id="avatarPanelId"
                class="profile-avatar-reveal"
                :class="{ 'is-expanded': editingAvatar }"
                :inert="!editingAvatar"
              >
                <div class="profile-avatar-clip">
                  <div class="profile-avatar-panel">
                    <ProfileAvatarPicker
                      ref="picker"
                      :assets="assets"
                      :assets-error="assetsError"
                      :custom-options="customOptions"
                      :disabled="pending"
                      :file-error="fileError"
                      :has-custom-photo="!!customOptions.length"
                      :reading="reading"
                      :removing-photo="!!removedPhotoId"
                      :selected-id="previewId"
                      @file="selectFile"
                      @remove="removePhoto"
                      @retry="reloadAssets"
                      @select="selectAvatar"
                    />
                  </div>
                </div>
              </div>
            </div>
            <UiTextField
              v-model="bio"
              :disabled="pending"
              :error="errors.bio"
              :label="t('identity.profile.bio')"
              :maxlength="2000"
              name="bio"
              :rows="4"
              @blur="touch('bio')"
            />
            <p v-if="message" class="account-notice account-notice-error" role="alert">{{ t(message) }}</p>
            <NuxtLink v-if="sessionExpired" to="/login?returnTo=/profile">{{ t('identity.login.submit') }}</NuxtLink>
          </form>
          <div
            v-else-if="loadingProfile || !profileError"
            :aria-label="t('identity.loading')"
            class="profile-form account-form"
            role="status"
          >
            <div class="profile-person"><UiSkeleton class="profile-avatar-placeholder" /><UiSkeleton class="profile-name-placeholder" /></div>
            <UiSkeleton class="profile-bio-placeholder" />
          </div>
          <SystemErrorState
            v-else
            compact
            :description="t(profileError)"
            :status-code="profileProblem?.status"
            :title="t('profileOverview.profileError')"
          >
            <NuxtLink v-if="signInNeeded" class="tk-button" to="/login?returnTo=/profile">{{ t('identity.login.submit') }}</NuxtLink>
            <button
              v-else
              class="tk-button"
              type="button"
              @click="reloadProfile"
            >{{ t('identity.retry') }}</button>
          </SystemErrorState>
          <ProfileTripStats v-if="!overviewError" :trips="overview?.trips" />
        </template>
        <SystemErrorState
          v-if="overviewError"
          class="profile-overview-error"
          compact
          :description="t(overviewError === 401 ? 'identity.errors.sessionRequired' : 'accountTrips.unavailableHint')"
          :status-code="overviewError"
          :title="t('profileOverview.overviewError')"
        >
          <NuxtLink v-if="overviewError === 401" class="tk-button" to="/login?returnTo=/profile">{{ t('identity.login.submit') }}</NuxtLink>
          <button
            v-else
            class="tk-button"
            type="button"
            @click="reloadOverview"
          >{{ t('identity.retry') }}</button>
        </SystemErrorState>
        <ProfileAchievements v-else :overview="overview" />
      </TravelerProfileLayout>
      <footer class="profile-footer">
        <UiStatus v-if="feedback" tone="success">{{ t(feedback) }}</UiStatus>
        <div class="account-actions">
          <button
            class="tk-button"
            :disabled="!profile || pending || (!hasEdits && !fileError && !reading && !photo)"
            type="button"
            @click="cancelProfile"
          >{{ t('identity.cancel') }}</button>
          <button
            class="tk-button tk-button-primary"
            :disabled="!canSave"
            form="personal-profile-form"
            type="submit"
          >
            {{ t(pending ? 'identity.working' : 'identity.save') }}
          </button>
        </div>
      </footer>
    </div>
  </WorkspacePage>
</template>

<style scoped>
.profile-content { --profile-pad: clamp(1rem, 2.15vw, 2rem); display: flex; flex-direction: column; block-size: 100%; min-inline-size: 0; background: var(--tk-surface); }
.profile-content a:focus-visible, .profile-avatar-button:focus-visible { outline: 2px solid var(--tk-focus); outline-offset: 2px; }
.profile-person { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--tk-space-4); }
.profile-name { display: grid; gap: var(--tk-space-2); }
.profile-overview-error { align-self: center; justify-self: center; }
.profile-avatar-button { position: relative; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
.profile-avatar-button :deep(.tk-avatar), .profile-avatar-placeholder { inline-size: clamp(4.25rem, 7.5vw, 6rem); block-size: auto; aspect-ratio: 1; border-radius: 50%; }
.profile-avatar-edit { position: absolute; display: grid; place-items: center; inset: auto 0 0 auto; inline-size: 1.7rem; aspect-ratio: 1; border: 2px solid var(--tk-surface); border-radius: 50%; background: var(--tk-accent); color: var(--tk-on-accent); font-size: .9rem; }
.profile-avatar-button:hover .profile-avatar-edit { background: var(--tk-focus); }
.profile-rating-skeleton { max-inline-size: 11rem; }
.profile-name-placeholder { block-size: var(--tk-text-input-height); }
.profile-bio-placeholder { block-size: 6.5rem; }
.profile-footer { display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--tk-space-2); padding: var(--tk-space-3) var(--profile-pad); border-block-start: 1px solid var(--tk-line); }
.profile-footer :deep(.tk-status) { margin-inline-end: auto; }
.profile-avatar-reveal { display: grid; grid-template-rows: 0fr; opacity: 0; }
.profile-avatar-reveal.is-expanded { grid-template-rows: 1fr; opacity: 1; }
.profile-avatar-clip { min-block-size: 0; overflow: hidden; }
.profile-avatar-panel { padding-block-start: var(--tk-space-3); }
.profile-avatar-edit svg { inline-size: 1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
@media (prefers-reduced-motion: no-preference) {
  .profile-avatar-reveal { transition: grid-template-rows 220ms ease, opacity 180ms ease; }
}
@media (max-width: 400px) {
  .profile-person { gap: var(--tk-space-3); }
}
</style>
