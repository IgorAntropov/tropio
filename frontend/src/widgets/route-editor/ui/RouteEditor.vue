<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue';
import {
  UiSegmented,
  UiSelect,
  UiStatus,
} from '@fsd/shared/ui/kit';
import { MaterialSymbol } from '@fsd/shared/ui/material-symbol';
import type {
  EditorBuildMode,
  EditorObject,
  EditorPoiChange,
  EditorPointChange,
  EditorProps,
  EditorSelection,
  EditorStatus,
  EditorTrackChange,
  EditorTransportMode,
} from '../types';
import EditorConflict from './EditorConflict.vue';
import EditorIssue from './EditorIssue.vue';
import EditorObjectForm from './EditorObjectForm.vue';
import EditorPoiDetails from './EditorPoiDetails.vue';
import EditorPoiForm from './EditorPoiForm.vue';
import EditorRoutePreview from './EditorRoutePreview.vue';
import EditorTimeline from './EditorTimeline.vue';
import {
  distanceLabel,
  routeDistance,
  transportIcons,
  useEditorCopy,
} from './presentation';

const props = defineProps<EditorProps>();
const emit = defineEmits<{
  'mode-change': [mode: 'view' | 'draw' | 'poi' | 'split' | 'move'];
  'transport-change': [mode: EditorTransportMode];
  'build-change': [mode: EditorBuildMode];
  'select': [selection: EditorSelection, openDetails: boolean];
  'close-editor': [];
  'update-point': [change: EditorPointChange];
  'update-track': [change: EditorTrackChange];
  'move-point': [id: string];
  'remove-point': [id: string];
  'split-track': [id: string];
  'undo': [];
  'redo': [];
  'clear-route': [];
  'retry': [];
  'accept-preview': [];
  'choose-alternative': [index: number];
  'cancel-preview': [];
  'load-server': [];
  'cancel-server': [];
  'use-server': [];
  'keep-local': [];
  'create-poi': [change: EditorPoiChange];
  'cancel-poi': [];
  'close-poi': [];
}>();

const { t } = useEditorCopy();
const view = ref('map');
const comparison = ref(false);
let objectInvoker: HTMLElement | undefined;

function selectFromTimeline(item: EditorSelection, openDetails: boolean, invoker: EventTarget | null) {
  if (openDetails && invoker instanceof HTMLElement) {
    objectInvoker = invoker;
  }
  emit('select', item, openDetails);
}

async function closeObjectForm() {
  const invoker = objectInvoker;
  emit('close-editor');
  await nextTick();
  invoker?.focus({ preventScroll: true });
}

watch(() => props.editing, (editing) => {
  if (!editing) {
    objectInvoker = undefined;
  }
});

const viewOptions = computed(() => [{ value: 'map', label: t('map') }, { value: 'scheme', label: t('scheme') }]);

const tools = [
  { mode: 'view', label: 'view', icon: 'pan_tool' },
  { mode: 'draw', label: 'draw', icon: 'route' },
  { mode: 'poi', label: 'poi', icon: 'add_location_alt' },
] as const;
const statusTones: Record<EditorStatus, 'success' | 'pending' | 'muted' | 'warning' | 'danger'> = {
  idle: 'muted',
  saving: 'pending',
  saved: 'success',
  offline: 'warning',
  conflict: 'warning',
  error: 'danger',
};
const help = computed(() => {
  if (props.modeHelp) {
    return props.modeHelp;
  }
  if (props.busy && props.status !== 'saving' && props.mode === 'draw') {
    return t('calculating');
  }
  if (props.mode === 'draw') {
    return t(props.draft.points.length ? 'drawNext' : 'drawStart');
  }
  if (props.mode === 'move') {
    return t('moveHint');
  }
  if (props.mode === 'split') {
    return t('splitHint');
  }
  if (props.mode === 'poi') {
    return t('poiHint');
  }
  return '';
});

const transportOptions = computed(() => Object.keys(transportIcons).map(value => ({
  value,
  label: t(value),
  icon: transportIcons[value as EditorTransportMode],
})));
const buildOptions = computed(() => [
  { value: 'automatic', label: t('automatic') },
  { value: 'straight', label: t('straight') },
]);
const blocked = computed(() => props.busy || props.readOnly || props.loading);
const isBuild = computed(() => props.mode === 'draw');
const dayIndex = computed(() => props.otherDays?.findIndex(day => props.dayId ? day.id === props.dayId : day.label === props.dayLabel) ?? -1);

const object = computed<EditorObject | null>(() => {
  const selection = props.selection;
  if (!selection) {
    return null;
  }
  if (selection.type === 'point') {
    const point = props.draft.points.find(item => item.point_id === selection.id);
    return point ? { type: 'point', point } : null;
  }
  const track = props.draft.tracks.find(item => item.track_id === selection.id);
  return track ? { type: 'track', track } : null;
});

function pointTitle(pointId: string) {
  const index = props.draft.points.findIndex(point => point.point_id === pointId);
  return index === -1 ? '' : props.draft.points[index]?.name || t('point', { number: index + 1 });
}

const objectSubtitle = computed(() => {
  if (object.value?.type === 'track') {
    return t('trackBetween', {
      from: pointTitle(object.value.track.start_point_id),
      to: pointTitle(object.value.track.end_point_id),
    });
  }
  return undefined;
});

function openComparison() {
  comparison.value = true;
  if (props.conflict?.status !== 'ready') {
    emit('load-server');
  }
}

function closeComparison() {
  comparison.value = false;
  if (props.conflict?.status === 'loading') {
    emit('cancel-server');
  }
  emit('keep-local');
}

watch(() => props.mode, (mode) => {
  if (mode === 'move' || mode === 'split' || mode === 'poi' || mode === 'draw') {
    view.value = 'map';
  }
});

watch(() => props.readOnly && !props.viewingLocal, (restricted) => {
  if (restricted) {
    comparison.value = false;
  }
});
</script>

<template>
  <main class="route-editor" :data-view="view">
    <header class="editor-header">
      <div class="editor-page-title">
        <NuxtLink
          v-if="backTo"
          :aria-label="backLabel ?? t('back')"
          class="tk-button tk-icon-button editor-back"
          :to="backTo"
        >
          <span aria-hidden="true">←</span>
        </NuxtLink>
        <div>
          <p>{{ dayLabel }}</p>
          <h1>{{ title }}</h1>
        </div>
      </div>
      <div class="editor-status-group">
        <UiStatus :tone="viewingLocal ? 'warning' : statusTones[status]">{{ t(viewingLocal ? 'local' : status) }}</UiStatus>
        <button
          v-if="viewingLocal"
          class="tk-button tk-button-text editor-status-action"
          type="button"
          @click="emit('use-server')"
        >{{ t('useServer') }}</button>
        <button
          v-else-if="status === 'conflict'"
          class="tk-button tk-button-text editor-status-action"
          type="button"
          @click="openComparison"
        >{{ t('compare') }}</button>
        <button
          v-else-if="(status === 'offline' || status === 'error') && !readOnly"
          class="tk-button tk-button-text editor-status-action"
          type="button"
          @click="emit('retry')"
        >{{ t('retry') }}</button>
        <button
          v-else-if="hasLocalVersion"
          class="tk-button tk-button-text editor-status-action"
          type="button"
          @click="emit('keep-local')"
        >{{ t('keepLocal') }}</button>
        <button
          :aria-label="t('clearRoute')"
          class="tk-button tk-button-text tk-icon-button editor-clear"
          :disabled="blocked || !canClear"
          :title="t('clearRoute')"
          type="button"
          @click="emit('clear-route')"
        ><MaterialSymbol name="delete_sweep" /></button>
      </div>
    </header>

    <EditorIssue v-if="issue && !pendingPoi && !editing" :issue="issue" :sign-in-required="signInRequired" />

    <div class="editor-mobile-switch">
      <UiSegmented v-model="view" :label="t('mapScheme')" :options="viewOptions" />
    </div>

    <div class="editor-workspace">
      <section
        :aria-busy="loading"
        :aria-label="t('map')"
        class="editor-map"
        :data-mode="mode"
      >
        <div class="editor-map-surface"><slot :map-visible="view === 'map'" name="map" /></div>
        <div v-if="loading || help" class="editor-map-hint">
          <UiStatus v-if="loading || (busy && status !== 'saving' && mode === 'draw')" tone="pending">
            {{ loading ? t('loading') : help }}
          </UiStatus>
          <p v-else>{{ help }}</p>
        </div>

        <div v-if="isBuild && !readOnly" :aria-label="t('segmentMode')" class="editor-build-options">
          <UiSelect
            :disabled="blocked"
            :label="t('transport')"
            :model-value="[transportMode]"
            :options="transportOptions"
            @update:model-value="$event[0] && emit('transport-change', $event[0] as EditorTransportMode)"
          />
          <UiSelect
            :disabled="blocked"
            :label="t('segmentMode')"
            :model-value="[buildMode]"
            :options="buildOptions"
            @update:model-value="$event[0] && emit('build-change', $event[0] as EditorBuildMode)"
          />
        </div>

        <div :aria-label="t('tools')" class="editor-tools" role="group">
          <button
            v-for="tool in tools"
            :key="tool.mode"
            :aria-label="t(tool.label)"
            :aria-pressed="mode === tool.mode"
            class="tk-button tk-icon-button editor-tool"
            :class="{ 'editor-tool-active': mode === tool.mode }"
            :disabled="tool.mode !== 'view' && blocked"
            :title="t(tool.label)"
            type="button"
            @click="emit('mode-change', tool.mode)"
          >
            <MaterialSymbol :name="tool.icon" />
          </button>
          <span aria-hidden="true" class="editor-tools-rule" />
          <button
            :aria-label="t('undo')"
            class="tk-button tk-icon-button editor-tool"
            :disabled="blocked || !canUndo"
            :title="t('undo')"
            type="button"
            @click="emit('undo')"
          ><MaterialSymbol name="undo" /></button>
          <button
            :aria-label="t('redo')"
            class="tk-button tk-icon-button editor-tool"
            :disabled="blocked || !canRedo"
            :title="t('redo')"
            type="button"
            @click="emit('redo')"
          ><MaterialSymbol name="redo" /></button>
        </div>
      </section>

      <aside :aria-busy="loading" :aria-label="t('scheme')" class="editor-scheme">
        <header class="editor-scheme-heading">
          <div>
            <h2>{{ t('route') }}</h2>
            <p>
              <b>{{ distanceLabel(routeDistance(draft.tracks)) }}</b>
              <template v-if="draft.trip_type"> · {{ t(draft.trip_type) }}</template>
            </p>
          </div>
          <nav v-if="otherDays && otherDays.length > 1 && dayIndex >= 0" :aria-label="t('dayNavigation')">
            <NuxtLink
              v-if="otherDays[dayIndex - 1]"
              :aria-label="`${t('previousDay')} · ${otherDays[dayIndex - 1]!.label}`"
              class="tk-button tk-icon-button"
              :to="otherDays[dayIndex - 1]!.to"
            >‹</NuxtLink>
            <button
              v-else
              :aria-label="t('previousDay')"
              class="tk-button tk-icon-button"
              disabled
              type="button"
            >‹</button>
            <NuxtLink
              v-if="otherDays[dayIndex + 1]"
              :aria-label="`${t('openDay')} · ${otherDays[dayIndex + 1]!.label}`"
              class="tk-button tk-icon-button"
              :to="otherDays[dayIndex + 1]!.to"
            >›</NuxtLink>
            <button
              v-else
              :aria-label="t('openDay')"
              class="tk-button tk-icon-button"
              disabled
              type="button"
            >›</button>
          </nav>
        </header>
        <div class="editor-scheme-body">
          <p v-if="loading" class="editor-scheme-empty">{{ t('loading') }}</p>
          <EditorTimeline
            v-else-if="draft.points.length"
            :draft="draft"
            interactive
            :read-only="readOnly"
            :selection="selection"
            :view="view"
            @select="selectFromTimeline"
          />
          <div v-else class="editor-scheme-empty">
            <MaterialSymbol name="alt_route" />
            <h3>{{ t(readOnly ? 'readonlyEmpty' : 'empty') }}</h3>
            <p v-if="!readOnly">{{ t('emptyHelp') }}</p>
            <button
              v-if="!readOnly"
              class="tk-button editor-open-map"
              type="button"
              @click="view = 'map'; emit('mode-change', 'draw')"
            >{{ t('openMap') }}</button>
          </div>
        </div>
      </aside>
    </div>

    <EditorConflict
      v-if="comparison"
      :conflict="conflict"
      :draft="draft"
      @close="closeComparison"
      @reload="emit('load-server')"
      @server="comparison = false; emit('use-server')"
    />
    <EditorRoutePreview
      v-else-if="preview"
      :disabled="blocked"
      :preview="preview"
      @accept="emit('accept-preview')"
      @choose="emit('choose-alternative', $event)"
      @close="emit('cancel-preview')"
    />
    <EditorPoiForm
      v-else-if="pendingPoi"
      :data="pendingPoi"
      :disabled="blocked"
      :issue="issue"
      :sign-in-required="signInRequired"
      @close="emit('cancel-poi')"
      @save="emit('create-poi', $event)"
    />
    <EditorPoiDetails v-else-if="activePoi" :poi="activePoi" @close="emit('close-poi')" />
    <EditorObjectForm
      v-else-if="editing && object"
      :key="selection?.id"
      :can-edit="!readOnly"
      :can-remove="draft.points.length > 1"
      :disabled="blocked"
      :issue="issue"
      :object="object"
      :sign-in-required="signInRequired"
      :subtitle="objectSubtitle"
      @close="closeObjectForm"
      @move="view = 'map'; emit('move-point', $event)"
      @point="emit('update-point', $event)"
      @remove="emit('remove-point', $event)"
      @split="view = 'map'; emit('split-track', $event)"
      @track="emit('update-track', $event)"
    />
  </main>
</template>

<style src="./editor.css"></style>
