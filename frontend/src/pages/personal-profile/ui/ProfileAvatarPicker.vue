<script setup lang="ts">
import type { SystemAvatar } from '@fsd/shared/api';
import { imageFileAccept } from '@fsd/shared/image-file';
import {
  UiAvatar,
  UiSkeleton,
} from '@fsd/shared/ui/kit';

const props = defineProps<{
  assets?: SystemAvatar[];
  customOptions: { id: string; url: string; label: string }[];
  selectedId: string;
  hasCustomPhoto: boolean;
  removingPhoto: boolean;
  disabled: boolean;
  reading: boolean;
  fileError: string;
  assetsError: string;
}>();
const emit = defineEmits<{ select: [id: string]; remove: [id: string]; file: [file: File]; retry: [] }>();
const { t } = useI18n();
const picker = useTemplateRef<HTMLInputElement>('picker');
const upload = useTemplateRef<HTMLButtonElement>('upload');
const hint = useId();

const options = computed(() => [
  ...props.customOptions.map(item => ({ ...item, removable: true })),
  ...(props.assets ?? []).map((item, index) => ({ ...item, label: t('identity.profile.avatarChoice', { number: index + 1 }), removable: false })),
]);

function removePhoto(id: string) {
  emit('remove', id);
  upload.value?.focus({ preventScroll: true });
}

function chooseFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) {
    emit('file', file);
  }
}

defineExpose({ focus: () => upload.value?.focus({ preventScroll: true }) });
</script>

<template>
  <fieldset :aria-describedby="hint" class="profile-avatar-fieldset" :disabled="disabled">
    <legend class="tk-sr-only">{{ t('identity.profile.avatarTitle') }}</legend>
    <div class="profile-avatar-options">
      <button
        ref="upload"
        :aria-label="t(hasCustomPhoto ? 'identity.profile.replaceAvatar' : 'identity.profile.uploadAvatar')"
        class="profile-avatar-option profile-avatar-upload"
        :title="t(hasCustomPhoto ? 'identity.profile.replaceAvatar' : 'identity.profile.uploadAvatar')"
        type="button"
        @click="picker?.click()"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15.5 6.5h-1l-1.7-2H8.6l-1.7 2H4a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5M18.5 6.5H23M20.75 4.25v4.5" /><circle cx="11" cy="13" r="3.5" /></svg>
        <span>{{ t('identity.profile.customPhoto') }}</span>
      </button>
      <input
        ref="picker"
        :accept="imageFileAccept"
        hidden
        name="avatar-file"
        type="file"
        @change="chooseFile"
      >
      <div v-for="item in options" :key="item.id" class="profile-avatar-tile">
        <label class="profile-avatar-option">
          <input
            :aria-label="item.label"
            :checked="selectedId === item.id"
            class="tk-sr-only"
            name="avatar"
            type="radio"
            :value="item.id"
            @change="emit('select', item.id)"
          >
          <span aria-hidden="true"><UiAvatar :name="item.label" :src="item.url" /></span>
        </label>
        <button
          v-if="item.removable"
          :aria-label="t('identity.profile.removePhoto', { name: item.label })"
          class="profile-avatar-remove"
          :title="t('identity.profile.removePhoto', { name: item.label })"
          type="button"
          @click="removePhoto(item.id)"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></svg>
        </button>
      </div>
      <template v-if="!assets && !assetsError">
        <UiSkeleton v-for="index in 12" :key="index" class="profile-avatar-placeholder" />
      </template>
    </div>
    <p :id="hint" class="tk-field-hint profile-avatar-hint">{{ t('imageFile.hint') }}</p>
    <p v-if="removingPhoto" class="tk-field-hint" role="status">{{ t('identity.profile.photoRemovalPending') }}</p>
    <p v-if="reading" class="tk-field-hint" role="status">{{ t('imageFile.reading') }}</p>
    <p v-if="fileError" class="tk-field-error" role="alert">{{ t(fileError) }}</p>
    <div v-if="assetsError" class="profile-collection-error" role="alert">
      <span>{{ t(assetsError) }}</span><button class="tk-button tk-button-text" type="button" @click="emit('retry')">{{ t('identity.retry') }}</button>
    </div>
  </fieldset>
</template>

<style scoped>
.profile-avatar-fieldset { display: grid; gap: var(--tk-space-2); min-inline-size: 0; margin: 0; padding: var(--tk-space-3); border: 1px solid var(--tk-line); border-radius: var(--tk-radius); }
.profile-avatar-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(3.7rem, 100%), 1fr)); gap: var(--tk-space-2); }
.profile-avatar-option { position: relative; display: grid; place-content: center; justify-items: center; min-inline-size: 0; min-block-size: var(--tk-target); aspect-ratio: 1; padding: .2rem; border: 1px solid var(--tk-line); border-radius: var(--tk-radius); background: var(--tk-surface); cursor: pointer; }
.profile-avatar-option:hover { background: var(--tk-raised); }
.profile-avatar-tile { position: relative; min-inline-size: 0; }
.profile-avatar-remove { position: absolute; inset-block-start: -.2rem; inset-inline-end: -.2rem; display: grid; place-items: center; inline-size: 1.75rem; block-size: 1.75rem; padding: 0; border: 1px solid var(--tk-line); border-radius: 50%; background: var(--tk-surface); color: var(--tk-accent); cursor: pointer; }
.profile-avatar-remove:hover { background: var(--tk-raised); }
.profile-avatar-remove:focus-visible { outline: 2px solid var(--tk-focus); outline-offset: 2px; }
.profile-avatar-remove svg { inline-size: 1rem; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.profile-avatar-hint { text-align: end; }
.profile-avatar-option:has(:checked) { border-color: var(--tk-accent); background: var(--tk-selected); box-shadow: inset 0 0 0 1px var(--tk-accent); }
.profile-avatar-option:focus-visible, .profile-avatar-option:has(:focus-visible) { outline: 2px solid var(--tk-focus); outline-offset: 2px; }
.profile-avatar-option :deep(.tk-avatar) { inline-size: 2.65rem; block-size: auto; aspect-ratio: 1; }
.profile-avatar-upload { gap: .1rem; border-style: dashed; border-color: var(--tk-accent); color: var(--tk-accent); font-size: .68rem; font-weight: 650; }
.profile-avatar-upload svg { inline-size: 1.35rem; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.profile-avatar-placeholder { block-size: auto; aspect-ratio: 1; }
.profile-avatar-fieldset p { margin: 0; }
.profile-collection-error { display: flex; flex-wrap: wrap; align-items: center; gap: var(--tk-space-2); color: var(--tk-muted); font-size: var(--tk-text-sm); }
@media (pointer: coarse) {
  .profile-avatar-tile:has(.profile-avatar-remove) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-column: span 2; align-items: center; column-gap: var(--tk-space-2); border-radius: var(--tk-radius); background: var(--tk-raised); }
  .profile-avatar-remove { position: static; justify-self: center; inline-size: var(--tk-target); block-size: var(--tk-target); }
}
</style>
