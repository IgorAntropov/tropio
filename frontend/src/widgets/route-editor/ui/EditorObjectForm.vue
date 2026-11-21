<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  useId,
} from 'vue';
import {
  hasInvalidText,
  useFormValidation,
} from '@fsd/shared/ui/form';
import {
  UiDialog,
  UiSelect,
  UiTextField,
} from '@fsd/shared/ui/kit';
import type {
  EditorBuildMode,
  EditorObject,
  EditorPointChange,
  EditorTrackChange,
  EditorTransportMode,
} from '../types';
import EditorIssue from './EditorIssue.vue';
import {
  coordinateLabel,
  distanceLabel,
  transportIcons,
  useEditorCopy,
} from './presentation';

const props = defineProps<{
  object: EditorObject;
  subtitle?: string;
  disabled?: boolean;
  canRemove?: boolean;
  canEdit?: boolean;
  issue?: string | null;
  signInRequired?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  point: [change: EditorPointChange];
  track: [change: EditorTrackChange];
  move: [id: string];
  split: [id: string];
  remove: [id: string];
}>();

const { t } = useEditorCopy();
const name = ref(props.object.type === 'point' ? props.object.point.name ?? '' : props.object.track.name ?? '');
const description = ref(props.object.type === 'point' ? props.object.point.description ?? '' : props.object.track.description ?? '');
const initialPosition = props.object.type === 'point' ? props.object.point.requested_position ?? props.object.point.position : null;
const lat = ref(initialPosition ? String(initialPosition.lat) : '');
const lon = ref(initialPosition ? String(initialPosition.lon) : '');
const showPosition = ref(false);
const coordinateFields = ref<HTMLDivElement>();
const confirmingRemoval = ref(false);
const removeTrigger = ref<HTMLButtonElement>();
const cancelRemoval = ref<HTMLButtonElement>();
const removeDescription = useId();
const transportMode = ref<readonly string[]>(props.object.type === 'track' ? [props.object.track.transport_mode] : []);
const buildMode = ref<readonly string[]>(props.object.type === 'track' ? [props.object.track.build_mode] : []);
const lockedPosition = computed(() => props.object.type === 'point' && !!props.object.point.poi_id);
const transportChoices = Object.keys(transportIcons) as EditorTransportMode[];
const transports = computed(() => transportChoices.map(value => ({
  value,
  label: t(value),
  icon: transportIcons[value],
})));
const buildOptions = computed<{ value: EditorBuildMode; label: string }[]>(() => [
  { value: 'automatic', label: t('automatic') },
  { value: 'straight', label: t('straight') },
]);

function parseCoordinate(raw: string, limit: number) {
  const clean = raw.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(clean)) {
    return null;
  }
  const number = Number(clean);
  return Math.abs(number) <= limit ? number : null;
}

const latitude = computed(() => parseCoordinate(lat.value, 90));
const longitude = computed(() => parseCoordinate(lon.value, 180));
const editingPosition = computed(() => props.object.type === 'point' && showPosition.value && !lockedPosition.value);
const selectedTransport = computed(() => transportChoices.find(value => value === transportMode.value[0]));
const selectedBuild = computed(() => buildOptions.value.find(option => option.value === buildMode.value[0])?.value);
const { valid, errors, touch } = useFormValidation({
  name: () => {
    if (hasInvalidText(name.value)) {
      return t('invalidText');
    }
    if ([...name.value.trim()].length > 120) {
      return t('nameTooLong');
    }
  },
  description: () => {
    if (hasInvalidText(description.value)) {
      return t('invalidText');
    }
    if ([...description.value.trim()].length > 4000) {
      return t('descriptionTooLong');
    }
  },
  latitude: () => editingPosition.value && latitude.value === null ? t('invalidLatitude') : undefined,
  longitude: () => editingPosition.value && longitude.value === null ? t('invalidLongitude') : undefined,
});
const canSubmit = computed(() => props.canEdit && !props.disabled && valid.value
  && !confirmingRemoval.value && (props.object.type === 'point' || (!!selectedTransport.value && !!selectedBuild.value)));

async function editPosition() {
  showPosition.value = true;
  await nextTick();
  coordinateFields.value?.querySelector('input')?.focus();
}

async function requestRemoval() {
  if (props.disabled || !props.canEdit || !props.canRemove) {
    return;
  }
  confirmingRemoval.value = true;
  await nextTick();
  cancelRemoval.value?.focus();
}

async function dismiss() {
  if (!confirmingRemoval.value) {
    emit('close');
    return;
  }
  confirmingRemoval.value = false;
  await nextTick();
  removeTrigger.value?.focus();
}

function confirmRemoval() {
  if (props.object.type !== 'point' || !confirmingRemoval.value || props.disabled || !props.canEdit || !props.canRemove) {
    return;
  }
  confirmingRemoval.value = false;
  emit('remove', props.object.point.point_id);
}

function submit() {
  if (!canSubmit.value) {
    return;
  }
  if (props.object.type === 'point') {
    const point = props.object.point;
    let position = point.position;
    if (editingPosition.value) {
      if (latitude.value === null || longitude.value === null) {
        return;
      }
      if (latitude.value !== initialPosition?.lat || longitude.value !== initialPosition?.lon) {
        position = { lat: latitude.value, lon: longitude.value };
      }
    }
    emit('point', {
      id: point.point_id,
      position,
      name: name.value.trim(),
      description: description.value.trim(),
    });
  }
  else if (selectedTransport.value && selectedBuild.value) {
    emit('track', {
      id: props.object.track.track_id,
      name: name.value.trim(),
      description: description.value.trim(),
      transport_mode: selectedTransport.value,
      build_mode: selectedBuild.value,
    });
  }
}
</script>

<template>
  <UiDialog
    :aria-describedby="confirmingRemoval ? removeDescription : undefined"
    class="editor-dialog"
    :layout="confirmingRemoval ? 'confirmation' : 'content'"
    :model-value="true"
    :subtitle="subtitle"
    :title="t(confirmingRemoval ? 'removeConfirm' : object.type === 'point' ? 'editPoint' : 'editTrack')"
    @cancel.prevent="dismiss"
    @update:model-value="!$event && dismiss()"
  >
    <form
      v-show="!confirmingRemoval"
      class="editor-form"
      novalidate
      @submit.prevent="submit"
    >
      <EditorIssue
        v-if="issue"
        compact
        :issue="issue"
        :sign-in-required="signInRequired"
      />
      <UiTextField
        v-model="name"
        :disabled="disabled || !canEdit"
        :error="errors.name"
        :label="t('rename')"
        :maxlength="240"
        @blur="touch('name')"
      />
      <UiTextField
        v-model="description"
        :disabled="disabled || !canEdit"
        :error="errors.description"
        :label="t('description')"
        :maxlength="8000"
        :rows="4"
        @blur="touch('description')"
      />
      <template v-if="object.type === 'point'">
        <div v-if="!showPosition" class="editor-object-position">
          <span class="editor-object-position-label">{{ t('position') }}</span>
          <button
            v-if="!lockedPosition && canEdit"
            :aria-label="`${t('editPosition')}: ${coordinateLabel(object.point.position)}`"
            class="editor-object-position-value editor-object-position-edit"
            :disabled="disabled"
            :title="t('editPosition')"
            type="button"
            @click="editPosition"
          >{{ coordinateLabel(object.point.position) }}</button>
          <span v-else class="editor-object-position-value">{{ coordinateLabel(object.point.position) }}</span>
        </div>
        <p v-if="lockedPosition" class="editor-support">{{ t('linkedPoi') }}</p>
        <div v-else-if="showPosition" ref="coordinateFields" class="editor-coordinate-fields">
          <UiTextField
            v-model="lat"
            :disabled="disabled || !canEdit"
            :error="errors.latitude"
            :label="t('latitude')"
            required
            @blur="touch('latitude')"
          />
          <UiTextField
            v-model="lon"
            :disabled="disabled || !canEdit"
            :error="errors.longitude"
            :label="t('longitude')"
            required
            @blur="touch('longitude')"
          />
        </div>
      </template>
      <template v-else>
        <div class="editor-coordinate-fields">
          <UiSelect
            v-model="transportMode"
            :disabled="disabled || !canEdit"
            :label="t('transport')"
            :options="transports"
          />
          <UiSelect
            v-model="buildMode"
            :disabled="disabled || !canEdit"
            :label="t('segmentMode')"
            :options="buildOptions"
          />
        </div>
        <p v-if="object.track.ascent_m != null && object.track.descent_m != null" class="editor-support">
          {{ t('elevation', { up: distanceLabel(object.track.ascent_m), down: distanceLabel(object.track.descent_m) }) }}
        </p>
      </template>

      <div v-if="canEdit" class="editor-object-tools">
        <template v-if="object.type === 'point'">
          <button
            v-if="!lockedPosition"
            class="tk-button"
            :disabled="disabled"
            type="button"
            @click="emit('move', object.point.point_id)"
          >{{ t('move') }}</button>
        </template>
        <button
          v-else-if="object.track.status === 'ready'"
          class="tk-button"
          :disabled="disabled"
          type="button"
          @click="emit('split', object.track.track_id)"
        >{{ t('split') }}</button>
      </div>
      <div class="editor-form-footer">
        <button
          v-if="object.type === 'point' && canEdit && canRemove"
          ref="removeTrigger"
          class="tk-button editor-danger editor-object-remove"
          :disabled="disabled"
          type="button"
          @click="requestRemoval"
        >{{ t('remove') }}</button>
        <div class="editor-object-save-actions">
          <button class="tk-button" type="button" @click="dismiss">{{ t(canEdit ? 'cancel' : 'close') }}</button>
          <button
            v-if="canEdit"
            class="tk-button tk-button-primary"
            :disabled="!canSubmit"
            type="submit"
          >{{ t('save') }}</button>
        </div>
      </div>
    </form>
    <div v-if="confirmingRemoval" class="editor-form">
      <p :id="removeDescription" class="editor-support">{{ t('removePointImpact') }}</p>
      <div class="editor-form-footer">
        <button
          ref="cancelRemoval"
          class="tk-button"
          type="button"
          @click="dismiss"
        >{{ t('cancel') }}</button>
        <button
          class="tk-button editor-object-confirm-remove"
          :disabled="disabled || !canEdit || !canRemove"
          type="button"
          @click="confirmRemoval"
        >
          {{ t('remove') }}
        </button>
      </div>
    </div>
  </UiDialog>
</template>

<style scoped>
.editor-object-position {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: var(--tk-space-2);
  font-size: var(--tk-text-sm);
  font-weight: 600;
}

.editor-object-position-value {
  min-inline-size: 0;
  justify-self: end;
  color: var(--tk-accent);
  overflow-wrap: anywhere;
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.editor-object-position-edit {
  min-block-size: var(--tk-target);
  max-inline-size: 100%;
  padding: 0;
  border: 0;
  border-radius: var(--tk-radius);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.editor-object-position-edit:hover:not(:disabled) {
  text-decoration: underline;
  text-underline-offset: .16em;
}

.editor-object-position-edit:focus-visible {
  outline: 2px solid var(--tk-focus);
  outline-offset: 2px;
}

.editor-object-position-edit:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.editor-object-remove {
  margin-inline-end: auto;
}

.editor-object-save-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--tk-space-2);
  margin-inline-start: auto;
}

.editor-object-confirm-remove, .editor-object-confirm-remove:hover:not(:disabled) {
  border-color: transparent;
  background: var(--tk-danger);
  color: var(--tk-surface);
}

.editor-object-confirm-remove:hover:not(:disabled) {
  filter: brightness(.93);
}
</style>
