<script setup lang="ts">
import { computed, ref } from 'vue'
import { UiDialog, UiSegmented, UiStatus } from '@fsd/shared/ui/kit'
import type { EditorConflict, EditorDraft } from '../types'
import EditorTimeline from './EditorTimeline.vue'
import { distanceLabel, routeDistance, useEditorCopy } from './presentation'

defineProps<{ conflict?: EditorConflict | null, draft: EditorDraft }>()
const emit = defineEmits<{ close: [], reload: [], server: [] }>()
const { t } = useEditorCopy()
const view = ref('local')
const options = computed(() => [{ value: 'local', label: t('local') }, { value: 'server', label: t('server') }])
</script>

<template>
  <UiDialog
    :model-value="true"
    class="editor-dialog editor-compare-dialog"
    :title="t('compare')"
    @update:model-value="!$event && emit('close')"
  >
    <UiStatus v-if="!conflict || conflict.status === 'loading' || conflict.status === 'idle'" tone="pending">
      {{ t('loadingServer') }}
    </UiStatus>
    <div v-else-if="conflict.status === 'error'" class="editor-compare-error">
      <p role="alert">{{ conflict.error || t('failedServer') }}</p>
      <button class="tk-button" type="button" @click="emit('reload')">{{ t('retry') }}</button>
    </div>
    <template v-else>
      <UiSegmented v-model="view" class="editor-compare-tabs" :label="t('compareTabs')" :options="options" />
      <div class="editor-compare-columns">
        <section class="editor-compare-version" :class="{ 'editor-compare-inactive': view !== 'local' }">
          <h3>{{ t('local') }}</h3>
          <p>{{ distanceLabel(routeDistance((conflict.local ?? draft).tracks)) }}</p>
          <EditorTimeline v-if="(conflict.local ?? draft).points.length" :draft="conflict.local ?? draft" />
          <p v-else>{{ t('empty') }}</p>
        </section>
        <section class="editor-compare-version" :class="{ 'editor-compare-inactive': view !== 'server' }">
          <h3>{{ t('server') }}</h3>
          <template v-if="conflict.server">
            <p>{{ distanceLabel(routeDistance(conflict.server.tracks)) }}</p>
            <EditorTimeline v-if="conflict.server.points.length" :draft="conflict.server" />
            <p v-else>{{ t('empty') }}</p>
          </template>
          <p v-else>{{ t('readonlyEmpty') }}</p>
        </section>
      </div>
      <p class="editor-support">{{ t('comparisonHelp') }}</p>
    </template>
    <div class="editor-form-footer">
      <button class="tk-button" type="button" @click="emit('close')">{{ t('keepLocal') }}</button>
      <button
        v-if="conflict?.status === 'ready' && conflict.server"
        class="tk-button tk-button-primary"
        type="button"
        @click="emit('server')"
      >{{ t('useServer') }}</button>
    </div>
  </UiDialog>
</template>
