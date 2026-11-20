<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { MaterialSymbol } from '@fsd/shared/ui/material-symbol'
import type { EditorDraft, EditorSelection } from '../types'
import { coordinateLabel, distanceLabel, transportIcons, useEditorCopy } from './presentation'

const props = defineProps<{
  draft: EditorDraft
  selection?: EditorSelection | null
  interactive?: boolean
  readOnly?: boolean
  view?: string
}>()

const emit = defineEmits<{ select: [selection: EditorSelection, openDetails: boolean, invoker: EventTarget | null] }>()
const { t } = useEditorCopy()
const list = ref<HTMLOListElement>()

watch([() => props.selection, () => props.view], async ([selection]) => {
  if (!selection || !props.interactive) return
  await nextTick()
  list.value?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
})

function select(type: EditorSelection['type'], id: string, openDetails: boolean, event: MouseEvent) {
  if (props.interactive) emit('select', { type, id }, openDetails && !props.readOnly, event.currentTarget)
}
</script>

<template>
  <ol
    ref="list"
    class="editor-timeline"
    :class="{ 'editor-timeline-static': !interactive }"
    :aria-label="t('scheme')"
  >
    <template v-for="(point, index) in draft.points" :key="point.point_id">
      <li :data-selected="selection?.type === 'point' && selection.id === point.point_id">
        <component
          :is="interactive ? 'button' : 'div'"
          class="editor-timeline-row"
          :type="interactive ? 'button' : undefined"
          :aria-pressed="interactive ? selection?.type === 'point' && selection.id === point.point_id : undefined"
          @click="select('point', point.point_id, $event.detail === 0, $event)"
          @dblclick="select('point', point.point_id, true, $event)"
        >
          <span class="editor-timeline-icon editor-timeline-number" aria-hidden="true">{{ index + 1 }}</span>
          <span class="editor-timeline-entry">
            <strong>{{ point.name || t('point', { number: index + 1 }) }}</strong>
            <span>{{ coordinateLabel(point.position) }}</span>
          </span>
        </component>
        <button
          v-if="interactive && !readOnly"
          class="tk-button tk-button-text tk-icon-button editor-timeline-edit"
          type="button"
          :aria-label="t('editTimeline', { name: point.name || t('point', { number: index + 1 }) })"
          @click="select('point', point.point_id, true, $event)"
        ><MaterialSymbol name="edit" /></button>
      </li>
      <li
        v-if="draft.tracks[index]"
        :data-selected="selection?.type === 'track' && selection.id === draft.tracks[index].track_id"
      >
        <component
          :is="interactive ? 'button' : 'div'"
          class="editor-timeline-row"
          :type="interactive ? 'button' : undefined"
          :aria-pressed="interactive ? selection?.type === 'track' && selection.id === draft.tracks[index].track_id : undefined"
          @click="select('track', draft.tracks[index]!.track_id, $event.detail === 0, $event)"
          @dblclick="select('track', draft.tracks[index]!.track_id, true, $event)"
        >
          <span class="editor-timeline-icon" aria-hidden="true">
            <MaterialSymbol :name="transportIcons[draft.tracks[index].transport_mode]" />
          </span>
          <span class="editor-timeline-entry">
            <strong>{{ draft.tracks[index].name || t('track', { number: index + 1 }) }}</strong>
            <span :class="{ 'editor-rebuild': draft.tracks[index].status === 'needs_rebuild' }">
              <template v-if="draft.tracks[index].status === 'needs_rebuild'">{{ t('needsRebuild') }}</template>
              <template v-else>
                <b v-if="draft.tracks[index].distance_m !== undefined">{{ distanceLabel(draft.tracks[index].distance_m ?? 0) }} · </b>
                {{ t(draft.tracks[index].build_mode === 'automatic' ? 'automaticShort' : 'straight') }}
              </template>
            </span>
          </span>
        </component>
        <button
          v-if="interactive && !readOnly"
          class="tk-button tk-button-text tk-icon-button editor-timeline-edit"
          type="button"
          :aria-label="t('editTimeline', { name: draft.tracks[index].name || t('track', { number: index + 1 }) })"
          @click="select('track', draft.tracks[index]!.track_id, true, $event)"
        ><MaterialSymbol name="edit" /></button>
      </li>
    </template>
  </ol>
</template>
