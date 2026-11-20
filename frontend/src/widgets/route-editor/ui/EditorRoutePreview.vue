<script setup lang="ts">
import { computed } from 'vue'
import { UiDialog } from '@fsd/shared/ui/kit'
import type { EditorPreview } from '../types'
import { coordinateLabel, distanceLabel, useEditorCopy } from './presentation'

const props = defineProps<{ preview: EditorPreview, disabled?: boolean }>()
const emit = defineEmits<{ accept: [], choose: [index: number], close: [] }>()
const { t } = useEditorCopy()

const reasons = { no_edge: 'noEdge', disconnected: 'disconnected', outside_coverage: 'outsideCoverage' } as const
const endpoints = computed(() => [
  { label: t('proposedStart'), ...props.preview.from },
  { label: t('proposedFinish'), ...props.preview.to },
])
</script>

<template>
  <UiDialog
    :model-value="true"
    class="editor-dialog"
    :title="t(preview.status === 'available' ? 'previewAvailable' : 'previewUnavailable')"
    :subtitle="preview.label"
    @update:model-value="!$event && emit('close')"
  >
    <p v-if="preview.reason" class="editor-support">{{ t(reasons[preview.reason]) }}</p>
    <div class="editor-preview-points">
      <section v-for="end in endpoints" :key="end.label" class="editor-preview-point">
        <h3>{{ end.label }}</h3>
        <dl>
          <dt>{{ t('requested') }}</dt>
          <dd>{{ coordinateLabel(end.requested) }}</dd>
          <template v-if="end.snapped && end.distance_m !== null">
            <dt>{{ t('snapped') }}</dt>
            <dd>{{ coordinateLabel(end.snapped) }}</dd>
            <dt class="editor-preview-shift">{{ t('shift', { distance: distanceLabel(end.distance_m) }) }}</dt>
          </template>
        </dl>
      </section>
    </div>
    <p
      v-if="preview.elevation_profile?.ascent_m != null && preview.elevation_profile.descent_m != null"
      class="editor-support"
    >
      {{ t('elevation', { up: distanceLabel(preview.elevation_profile.ascent_m), down: distanceLabel(preview.elevation_profile.descent_m) }) }}
    </p>
    <div v-if="preview.alternatives.length" class="editor-preview-alternatives">
      <button
        v-for="(alternative, index) in preview.alternatives" :key="index"
        type="button"
        class="tk-button editor-preview-alternative"
        :disabled="disabled"
        @click="emit('choose', index)"
      >
        <span>
          <b>{{ t(alternative.connection
            ? (alternative.build_mode === 'straight' ? 'connectionManual' : 'connectionWalk')
            : (alternative.build_mode === 'straight' ? 'optionManual' : 'optionWalk')) }}</b>
          <small v-if="alternative.warning">{{ t('warning') }}</small>
        </span>
        <span>{{ distanceLabel(alternative.distance_m) }}</span>
      </button>
    </div>
    <div class="editor-form-footer">
      <button class="tk-button" type="button" @click="emit('close')">{{ t('cancel') }}</button>
      <button
        v-if="preview.status === 'available' || preview.canKeepUnbuilt"
        class="tk-button tk-button-primary"
        type="button"
        :disabled="disabled"
        @click="emit('accept')"
      >{{ t(preview.status === 'available' ? 'accept' : 'acceptUnbuilt') }}</button>
    </div>
  </UiDialog>
</template>
