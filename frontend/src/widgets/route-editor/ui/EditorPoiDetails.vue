<script setup lang="ts">
import { computed, ref } from 'vue'
import { UiDialog } from '@fsd/shared/ui/kit'
import type { EditorPoi } from '../types'
import { useEditorCopy } from './presentation'

const props = defineProps<{ poi: EditorPoi }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useEditorCopy()
const selected = ref<number | null>(null)
const media = computed(() => props.poi.media ?? [])
const photo = computed(() => selected.value === null ? null : media.value[selected.value])
let touchX = 0

function step(offset: number) {
  if (selected.value === null || !media.value.length) return
  selected.value = (selected.value + offset + media.value.length) % media.value.length
}

function hidePhoto() {
  if (photo.value) selected.value = null
  else emit('close')
}

function onTouchStart(event: TouchEvent) {
  touchX = event.touches[0]?.clientX ?? 0
}
function onTouchEnd(event: TouchEvent) {
  const diff = (event.changedTouches[0]?.clientX ?? touchX) - touchX
  if (Math.abs(diff) >= 40) step(diff < 0 ? 1 : -1)
}
</script>

<template>
  <UiDialog
    :key="photo ? 'photo' : 'poi'"
    :model-value="true" class="editor-dialog"
    :title="photo ? t('photoCount', { current: (selected ?? 0) + 1, total: media.length }) : poi.name"
    @update:model-value="!$event && hidePhoto()"
    @keydown.left="step(-1)"
    @keydown.right="step(1)"
  >
    <template v-if="photo">
      <img
        class="editor-poi-photo"
        :src="photo.href" :alt="t('photo', { number: (selected ?? 0) + 1 })"
        @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd"
      >
      <div v-if="media.length > 1" class="editor-photo-controls">
        <button type="button" class="tk-button tk-icon-button" :aria-label="t('previousPhoto')" @click="step(-1)">‹</button>
        <button type="button" class="tk-button tk-icon-button" :aria-label="t('nextPhoto')" @click="step(1)">›</button>
      </div>
    </template>
    <template v-else>
      <p v-if="poi.description" class="editor-poi-description">{{ poi.description }}</p>
      <div v-if="media.length" class="editor-poi-media" :aria-label="t('media')">
        <button
          v-for="(item, index) in media" :key="item.media_id"
          type="button" :aria-label="t('photo', { number: index + 1 })" @click="selected = index"
        >
          <img :src="item.href" alt="" loading="lazy">
        </button>
      </div>
    </template>
  </UiDialog>
</template>
