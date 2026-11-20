<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouteScheme } from '@fsd/shared/ui/route-scheme'
import type { EditorDraft, EditorSelection } from '../types'
import { useEditorCopy } from './presentation'

const props = defineProps<{
  draft: EditorDraft
  selection?: EditorSelection | null
  interactive?: boolean
  readOnly?: boolean
  view?: string
}>()
const emit = defineEmits<{ select: [selection: EditorSelection, openDetails: boolean, invoker: EventTarget | null] }>()
const { t } = useEditorCopy()
const scheme = ref<InstanceType<typeof RouteScheme>>()
const points = computed(() => props.draft.points.map((point, index) => ({
  id: point.point_id, label: point.name || t('point', { number: index + 1 }), position: point.position,
})))
const tracks = computed(() => props.draft.tracks.map((track, index) => ({
  id: track.track_id, label: track.name || t('track', { number: index + 1 }), transportMode: track.transport_mode,
  warning: track.status === 'needs_rebuild', distance: track.status === 'needs_rebuild' ? undefined : track.distance_m,
  detail: track.status === 'needs_rebuild' ? t('needsRebuild') : t(track.build_mode === 'automatic' ? 'automaticShort' : 'straight'),
})))
const editLabel = (name: string) => t('editTimeline', { name })
watch([() => props.selection, () => props.view], ([selection]) => {
  if (selection && props.interactive) scheme.value?.scrollToSelection()
}, { flush: 'post' })
</script>

<template>
  <RouteScheme
    ref="scheme" :label="t('scheme')" :points="points" :tracks="tracks" :selection="selection"
    :interactive="interactive" :edit-label="readOnly ? undefined : editLabel"
    @select="(target, invoker) => emit('select', target, false, invoker)"
    @edit="(target, invoker) => emit('select', target, true, invoker)" />
</template>
