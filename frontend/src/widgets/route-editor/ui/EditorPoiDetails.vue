<script setup lang="ts">
import {
  computed,
  ref,
} from 'vue';
import { UiDialog } from '@fsd/shared/ui/kit';
import type { EditorPoi } from '../types';
import { useEditorCopy } from './presentation';

const props = defineProps<{ poi: EditorPoi }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useEditorCopy();
const selected = ref<number | null>(null);
const media = computed(() => props.poi.media ?? []);
const photo = computed(() => selected.value === null ? null : media.value[selected.value]);
let touchX = 0;

function step(offset: number) {
  if (selected.value === null || !media.value.length) {
    return;
  }
  selected.value = (selected.value + offset + media.value.length) % media.value.length;
}

function hidePhoto() {
  if (photo.value) {
    selected.value = null;
  }
  else {
    emit('close');
  }
}

function onTouchStart(event: TouchEvent) {
  touchX = event.touches[0]?.clientX ?? 0;
}
function onTouchEnd(event: TouchEvent) {
  const diff = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
  if (Math.abs(diff) >= 40) {
    step(diff < 0 ? 1 : -1);
  }
}
</script>

<template>
  <UiDialog
    :key="photo ? 'photo' : 'poi'"
    class="editor-dialog"
    :model-value="true"
    :title="photo ? t('photoCount', { current: (selected ?? 0) + 1, total: media.length }) : poi.name"
    @keydown.left="step(-1)"
    @keydown.right="step(1)"
    @update:model-value="!$event && hidePhoto()"
  >
    <template v-if="photo">
      <img
        :alt="t('photo', { number: (selected ?? 0) + 1 })"
        class="editor-poi-photo"
        :src="photo.href"
        @touchend.passive="onTouchEnd"
        @touchstart.passive="onTouchStart"
      >
      <div v-if="media.length > 1" class="editor-photo-controls">
        <button
          :aria-label="t('previousPhoto')"
          class="tk-button tk-icon-button"
          type="button"
          @click="step(-1)"
        >‹</button>
        <button
          :aria-label="t('nextPhoto')"
          class="tk-button tk-icon-button"
          type="button"
          @click="step(1)"
        >›</button>
      </div>
    </template>
    <template v-else>
      <p v-if="poi.description" class="editor-poi-description">{{ poi.description }}</p>
      <div v-if="media.length" :aria-label="t('media')" class="editor-poi-media">
        <button
          v-for="(item, index) in media"
          :key="item.media_id"
          :aria-label="t('photo', { number: index + 1 })"
          type="button"
          @click="selected = index"
        >
          <img alt="" loading="lazy" :src="item.href">
        </button>
      </div>
    </template>
  </UiDialog>
</template>
