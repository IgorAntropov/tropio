<script setup lang="ts">
import {
  computed,
  ref,
} from 'vue';
import { MaterialSymbol } from '@fsd/shared/ui/material-symbol';
import {
  coordinateLabel,
  distanceLabel,
  transportIcons,
} from './route-scheme';
import type {
  SchemePoint,
  SchemeSelection,
  SchemeTrack,
} from './route-scheme';

const props = defineProps<{
  label: string;
  points: readonly SchemePoint[];
  tracks: readonly SchemeTrack[];
  selection?: SchemeSelection | null;
  interactive?: boolean;
  editLabel?: (name: string) => string;
}>();
const emit = defineEmits<{
  select: [selection: SchemeSelection, invoker: EventTarget | null];
  edit: [selection: SchemeSelection, invoker: EventTarget | null];
}>();
const list = ref<HTMLOListElement>();
type Row = {
  target: SchemeSelection;
  label: string;
  number?: number;
  icon?: 'route' | (typeof transportIcons)[keyof typeof transportIcons];
  detail?: string;
  distance?: string;
  warning?: boolean;
};
const rows = computed(() => {
  const entries: Row[] = [];
  props.points.forEach((point, index) => {
    entries.push({
      target: { type: 'point', id: point.id },
      label: point.label,
      number: index + 1,
      detail: coordinateLabel(point.position),
    });
    const track = props.tracks[index];
    if (track) {
      entries.push({
        target: { type: 'track', id: track.id },
        label: track.label,
        icon: track.transportMode ? transportIcons[track.transportMode] : 'route',
        detail: track.detail,
        warning: track.warning,
        distance: track.distance === undefined ? undefined : distanceLabel(track.distance),
      });
    }
  });
  return entries;
});
function selected(target: SchemeSelection) {
  return props.selection?.type === target.type && props.selection.id === target.id;
}
function activate(target: SchemeSelection, event: MouseEvent) {
  if (!props.interactive) {
    return;
  }
  if (props.editLabel && event.detail === 0) {
    emit('edit', target, event.currentTarget);
  }
  else {
    emit('select', target, event.currentTarget);
  }
}
function scrollToSelection() {
  list.value?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
defineExpose({ scrollToSelection });
</script>

<template>
  <ol
    ref="list"
    :aria-label="label"
    class="route-scheme"
    :class="{ 'route-scheme-static': !interactive }"
  >
    <li
      v-for="row in rows"
      :key="row.target.type + ':' + row.target.id"
      :data-kind="row.target.type"
      :data-selected="selected(row.target)"
    >
      <component
        :is="interactive ? 'button' : 'div'"
        :aria-pressed="interactive ? selected(row.target) : undefined"
        class="route-scheme-row"
        :type="interactive ? 'button' : undefined"
        @click="activate(row.target, $event)"
        @dblclick="interactive && editLabel && emit('edit', row.target, $event.currentTarget)"
      >
        <span aria-hidden="true" class="route-scheme-icon" :class="{ 'route-scheme-number': row.number }">
          <MaterialSymbol v-if="row.icon" :name="row.icon" />
          <template v-else>{{ row.number }}</template>
        </span>
        <span class="route-scheme-entry">
          <strong>{{ row.label }}</strong>
          <span v-if="row.detail || row.distance" :class="{ 'route-scheme-warning': row.warning }">
            <b v-if="row.distance">{{ row.distance }}{{ row.detail ? ' · ' : '' }}</b>{{ row.detail }}
          </span>
        </span>
      </component>
      <button
        v-if="interactive && editLabel"
        :aria-label="editLabel(row.label)"
        class="tk-button tk-button-text tk-icon-button route-scheme-edit"
        type="button"
        @click="emit('edit', row.target, $event.currentTarget)"
      >
        <MaterialSymbol name="edit" />
      </button>
    </li>
  </ol>
</template>

<style scoped>
.route-scheme {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 12px 9px 16px;
  list-style: none;
}

.route-scheme > li {
  position: relative;
}

.route-scheme > li:not(:last-child)::before {
  position: absolute;
  inset: 40px auto -8px 26px;
  border-left: 2px dotted color-mix(in srgb, var(--tk-muted) 66%, transparent);
  content: "";
  pointer-events: none;
}

.route-scheme-row {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  min-height: 58px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 13px;
  background: transparent;
  color: inherit;
  text-align: left;
}

button.route-scheme-row {
  cursor: pointer;
}

button.route-scheme-row:focus-visible {
  z-index: 1;
  outline: 2px solid var(--tk-focus);
  outline-offset: -2px;
}

button.route-scheme-row:hover {
  background: var(--tk-raised);
}

.route-scheme > li[data-selected="true"] > .route-scheme-row {
  border-color: color-mix(in srgb, var(--tk-accent), var(--tk-line) 53%);
  background: color-mix(in srgb, var(--tk-accent) 11%, var(--tk-surface));
}

.route-scheme-row:has(+ .route-scheme-edit) {
  padding-inline-end: calc(var(--tk-target) + 4px);
}

.route-scheme-edit {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: 2px;
  min-height: var(--tk-target);
  transform: translateY(-50%);
  visibility: hidden;
  font-size: 1.15rem;
}

.route-scheme > li:is(:hover, :focus-within, [data-selected="true"]) > .route-scheme-edit {
  visibility: visible;
}

.route-scheme-icon {
  z-index: 1;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--tk-canvas) 55%, var(--tk-surface));
  color: var(--tk-accent);
  font-size: 1.05rem;
  line-height: 1;
}

.route-scheme-number {
  box-shadow: inset 0 0 0 1px var(--tk-line);
  font-size: .75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.route-scheme > li:first-child .route-scheme-number,
.route-scheme > li[data-selected="true"] .route-scheme-icon {
  background: var(--tk-accent);
  color: var(--tk-on-accent);
  box-shadow: none;
}

.route-scheme-entry {
  display: grid;
  min-width: 0;
  gap: 3px;
  overflow-wrap: anywhere;
}

.route-scheme-entry > strong {
  font-size: .875rem;
  line-height: 1.35;
}

.route-scheme-entry > span {
  color: var(--tk-muted);
  font-size: .76rem;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}

.route-scheme-entry b {
  color: var(--tk-ink);
  font-weight: 600;
}

.route-scheme-entry > .route-scheme-warning {
  color: var(--tk-warning);
}

.route-scheme-static .route-scheme-row {
  gap: 7px;
  padding-inline: 3px;
}

.route-scheme-static > li:not(:last-child)::before {
  left: 19px;
}
</style>
