<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  useId,
  useTemplateRef,
} from 'vue';
import type { CreateTripDraftRequest } from '@fsd/shared/api';
import { UiImage } from '@fsd/shared/ui/kit';
import { coverFileType } from '../cover-file';

const props = defineProps<{ existingUrl?: string; disabled: boolean }>();
const cover = defineModel<CreateTripDraftRequest['cover']>();
const emit = defineEmits<{ blocked: [value: boolean] }>();
const { t } = useI18n();
const id = useId();
const picker = useTemplateRef<HTMLInputElement>('picker');
const filename = ref('');
const error = ref('');
const loading = ref(false);
const custom = computed(() => !!cover.value || (cover.value === undefined && !!props.existingUrl));
const preview = computed(() => {
  if (cover.value) {
    return `data:${cover.value.content_type};base64,${cover.value.data_base64}`;
  }
  return cover.value === undefined && props.existingUrl ? props.existingUrl : '/default-trip-cover.webp';
});
let generation = 0;
let reader: FileReader | undefined;

function invalidateRead() {
  generation++;
  reader?.abort();
  reader = undefined;
}

function cancel() {
  invalidateRead();
  loading.value = false;
  error.value = '';
  emit('blocked', false);
}

function restore() {
  cancel();
  filename.value = '';
  cover.value = props.existingUrl ? null : undefined;
}

async function select(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) {
    return;
  }

  cancel();
  const selected = generation;
  emit('blocked', true);
  if (file.size > 2 * 1024 * 1024) {
    error.value = t('tripDrafts.cover.size');
    return;
  }

  loading.value = true;
  try {
    const type = coverFileType(await file.arrayBuffer());
    if (selected !== generation) {
      return;
    }
    if (type === 'animated') {
      error.value = t('tripDrafts.cover.animated');
      return;
    }
    if (!type || (file.type && file.type !== type)) {
      error.value = t('tripDrafts.cover.format');
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      reader = new FileReader();
      reader.onload = () => resolve(String(reader?.result));
      reader.onerror = reader.onabort = () => reject(new Error('Image read failed'));
      reader.readAsDataURL(file);
    });
    if (selected !== generation) {
      return;
    }
    const encoded = data.slice(data.indexOf(',') + 1);
    const image = new Image();
    image.src = `data:${type};base64,${encoded}`;
    await image.decode();
    if (selected === generation) {
      if (image.naturalHeight * image.naturalWidth > 40_000_000) {
        error.value = t('tripDrafts.cover.dimensions');
        return;
      }
      filename.value = file.name;
      cover.value = { content_type: type, data_base64: encoded };
      emit('blocked', false);
    }
  }
  catch {
    if (selected === generation) {
      error.value = t('tripDrafts.cover.error');
    }
  }
  finally {
    if (selected === generation) {
      reader = undefined;
      loading.value = false;
    }
  }
}

onBeforeUnmount(invalidateRead);
</script>

<template>
  <section :aria-label="t('tripDrafts.cover.title')" class="tk-field trip-cover">
    <div class="trip-cover-preview">
      <UiImage :alt="t(custom ? 'tripDrafts.cover.custom' : 'tripDrafts.cover.default')" class="trip-cover-image" :src="preview">
        <template #error="{ retry }">
          <span class="trip-cover-unavailable">
            <span role="status">{{ t('tripDrafts.cover.unavailable') }}</span>
            <button class="tk-button tk-button-text" type="button" @click="retry">{{ t('identity.retry') }}</button>
          </span>
        </template>
      </UiImage>
      <button
        :aria-describedby="id + '-hint'"
        class="tk-button trip-cover-action"
        :disabled="disabled"
        type="button"
        @click="picker?.click()"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="20"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.7"
          viewBox="0 0 24 24"
          width="20"
        >
          <path d="M20 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8m5-2v8m-4-4h8M3 16l5-5 4 4 2-2 6 6" />
        </svg>
        {{ t(custom ? 'tripDrafts.cover.replace' : 'tripDrafts.cover.choose') }}
      </button>
      <input
        ref="picker"
        accept="image/jpeg,image/png,image/webp"
        :disabled="disabled"
        hidden
        name="cover"
        type="file"
        @change="select"
      >
    </div>
    <div class="trip-cover-meta">
      <span :id="id + '-hint'" class="tk-field-hint">{{ filename || t('tripDrafts.cover.hint') }}</span>
      <button
        v-if="error || loading"
        class="tk-button tk-button-text"
        :disabled="disabled"
        type="button"
        @click="cancel"
      >{{ t('identity.cancel') }}</button>
      <button
        v-if="custom"
        class="tk-button tk-button-text"
        :disabled="disabled"
        type="button"
        @click="restore"
      >{{ t('tripDrafts.cover.restore') }}</button>
    </div>
    <span v-if="loading" class="tk-field-hint" role="status">{{ t('tripDrafts.cover.reading') }}</span>
    <span v-if="error" class="tk-field-error" role="alert">{{ error }}</span>
  </section>
</template>

<style scoped>
.trip-cover-preview { position: relative; overflow: hidden; border-radius: var(--tk-radius); background: var(--tk-raised); }
.trip-cover-image { height: clamp(7.5rem, 19dvh, 11rem); }
.trip-cover-unavailable { display: flex; flex-wrap: wrap; align-items: center; column-gap: var(--tk-space-2); padding: var(--tk-space-2) var(--tk-space-3); color: var(--tk-muted); font-size: var(--tk-text-sm); }
.trip-cover-action {
  position: absolute;
  inset: auto var(--tk-space-2) var(--tk-space-2) auto;
  border-color: rgb(255 255 255 / 44%);
  background: rgb(255 255 255 / 64%);
  color: #0c1b17;
  box-shadow: 0 1px 5px rgb(23 40 36 / 13%);
}
@supports (backdrop-filter: blur(1px)) {
  .trip-cover-action { background: rgb(255 255 255 / 47%); backdrop-filter: blur(7px) contrast(.85); }
}
.trip-cover-action:hover:not(:disabled) { background: rgb(255 255 255 / 68%); }
.trip-cover-meta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; column-gap: var(--tk-space-2); }
.trip-cover-meta .tk-field-hint { font-size: .75rem; overflow-wrap: anywhere; }
.trip-cover-meta .tk-button { padding-inline: 0; font-size: var(--tk-text-sm); }
</style>
