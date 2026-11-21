<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import {
  editorApi,
  EditorResponseError,
  identityApi,
  IdentityResponseError,
} from '@fsd/shared/api';
import type { TravelDraft } from '@fsd/shared/api';
import {
  workspaceMemberKey,
  workspaceReloadNoticeKey,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';
import { UiDateRange } from '@fsd/shared/ui/date-range';
import {
  hasInvalidText,
  useFormValidation,
} from '@fsd/shared/ui/form';
import {
  UiDialog,
  UiSkeleton,
  UiTextField,
} from '@fsd/shared/ui/kit';
import {
  tripDaySchedule,
  tripSettings,
  tripSettingsBody,
  tripSettingsPatch,
  useCreatedTripDay,
} from '../model';
import TripCoverField from './TripCoverField.vue';
import TripEquipmentField from './TripEquipmentField.vue';

const props = defineProps<{ draft?: TravelDraft }>();
const emit = defineEmits<{ saved: [draft: TravelDraft] }>();
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const router = useRouter();
const id = useId();
const capacityInput = useTemplateRef<HTMLInputElement>('capacityInput');
const maxCapacity = 2_147_483_647;
const capacityBadInput = ref(false);
const fields = reactive(tripSettings());
const base = shallowRef<TravelDraft>();
const created = shallowRef<TravelDraft>();
const createdDay = useCreatedTripDay();
const busy = ref(false);
const uncertain = ref(false);
const conflict = ref(false);
const reloadNotice = useState<string | null>(workspaceReloadNoticeKey, () => null);
const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
const issue = ref('');
const coverBlocked = ref(false);
const gearUnfinished = ref(false);
const sessionReady = ref(false);
const loadAttempt = ref(0);
const accountChanged = new Error('TRIP_FORM_ACCOUNT_CHANGED');
let owner = '';
let request = new AbortController();
let commandKey = '';

const locked = computed(() => busy.value || uncertain.value || !!created.value || conflict.value);
const schedule = computed(() => tripDaySchedule(base.value, fields.start_date, fields.end_date));
const modified = computed(() => !base.value
  || Object.keys(tripSettingsPatch(base.value, tripSettingsBody(fields))).length > 1);
const { errors, valid, touch, reset } = useFormValidation({
  title: () => {
    const value = fields.title.trim();
    if (!value) {
      return t('tripDrafts.titleRequired');
    }
    if (hasInvalidText(value)) {
      return t('tripDrafts.titleInvalid');
    }
    if ([...value].length > 120) {
      return t('tripDrafts.titleTooLong');
    }
  },
  description: () => {
    if (hasInvalidText(fields.description)) {
      return t('tripDrafts.titleInvalid');
    }
    if ([...fields.description.trim()].length > 4000) {
      return t('tripDrafts.descriptionTooLong');
    }
  },
  dates: () => schedule.value.valid ? undefined : t('tripDrafts.dayDates'),
  free_capacity: () => {
    const capacity = fields.free_capacity.trim();
    if (capacityBadInput.value || (capacity && (!/^\d+$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > maxCapacity))) {
      return t('tripDrafts.invalidCapacity');
    }
  },
});

const canSubmit = computed(() => sessionReady.value && !busy.value && valid.value && modified.value && !coverBlocked.value && !gearUnfinished.value);

function readCapacity() {
  const input = capacityInput.value;
  if (input) {
    fields.free_capacity = input.value;
    capacityBadInput.value = input.validity.badInput;
  }
}

function stepCapacity(direction: number) {
  capacityInput.value?.stepUp(direction);
  readCapacity();
}

function setFields(draft?: TravelDraft) {
  base.value = draft;
  Object.assign(fields, tripSettings(draft));
  capacityBadInput.value = false;
  coverBlocked.value = false;
  gearUnfinished.value = false;
  conflict.value = false;
  issue.value = '';
  commandKey = '';
  reset();
}

function reloadWorkspace(message: string) {
  if (reloadNotice.value) {
    return;
  }
  request.abort();
  reloadNotice.value = t(message);
  void nextTick(() => window.location.reload());
}

function sessionError(error: unknown) {
  const problem = error instanceof IdentityResponseError || error instanceof EditorResponseError ? error : undefined;
  if (error !== accountChanged && problem?.status !== 401 && problem?.code !== 'CSRF_REJECTED') {
    return false;
  }
  reloadWorkspace(problem?.status === 401 ? 'tripDrafts.sessionExpired' : 'tripDrafts.accountChanged');
  return true;
}

async function formToken(signal: AbortSignal) {
  const session = await identityApi.me(signal);
  signal.throwIfAborted();
  if (session.id !== owner) {
    throw accountChanged;
  }
  return session.csrf_token;
}

watch([open, loadAttempt], async ([opening], _, cleanup) => {
  if (!opening || import.meta.server) {
    return;
  }
  const controller = new AbortController();
  request = controller;
  const { signal } = controller;
  const recheck = () => {
    if (sessionReady.value && !signal.aborted) {
      void formToken(signal).catch(error => !signal.aborted && sessionError(error));
    }
  };
  window.addEventListener('focus', recheck, { signal });
  cleanup(() => controller.abort());
  sessionReady.value = false;
  issue.value = '';
  try {
    if (uncertain.value || created.value) {
      await formToken(signal);
    }
    else {
      const pageOwner = member.value?.id;
      const session = await identityApi.me(signal);
      signal.throwIfAborted();
      if (pageOwner && session.id !== pageOwner) {
        throw accountChanged;
      }
      owner = session.id;
      const fresh = props.draft && await editorApi.getTrip(props.draft.trip_id, signal);
      signal.throwIfAborted();
      if (fresh) {
        await formToken(signal);
      }
      setFields(fresh);
    }
    sessionReady.value = true;
  }
  catch (error) {
    if (!signal.aborted) {
      showError(error);
    }
  }
}, { immediate: true });

function closeDialog() {
  if (!busy.value) {
    created.value = undefined;
    open.value = false;
  }
}

function showError(error: unknown) {
  if (sessionError(error)) {
    return;
  }
  if (props.draft && error instanceof EditorResponseError && (error.status === 403 || error.status === 404)) {
    reloadWorkspace('catalog.unavailableTrip');
    return;
  }
  if (error instanceof EditorResponseError || error instanceof IdentityResponseError) {
    if (error.status === 404) {
      issue.value = t('catalog.unavailableTrip');
      return;
    }
    if (error.code === 'TRIP_REVISION_CONFLICT') {
      conflict.value = true;
      issue.value = t('tripDrafts.conflict');
      return;
    }
    if (error.code === 'INVALID_TRIP_DATES') {
      issue.value = t('tripDrafts.dayDates');
      return;
    }
    if (error.status < 500) {
      issue.value = t('identity.errors.invalidRequest');
      return;
    }
  }
  issue.value = t('identity.errors.unavailable');
}

async function refreshDraft() {
  if (!base.value || busy.value) {
    return;
  }
  busy.value = true;
  const { signal } = request;
  try {
    const fresh = await editorApi.getTrip(base.value.trip_id, signal);
    await formToken(signal);
    setFields(fresh);
    emit('saved', fresh);
  }
  catch (error) {
    if (!signal.aborted) {
      showError(error);
    }
  }
  finally {
    busy.value = false;
  }
}

async function openCreatedTrip(draft: TravelDraft) {
  const day = draft.days[0];
  const path = `/trips/${draft.trip_id}`;
  createdDay.value = day?.day_id ?? null;
  const failure = await router.push(day ? `${path}/days/${day.day_id}/route` : path);
  if (failure) {
    createdDay.value = null;
    issue.value = t('tripDrafts.created');
    return;
  }
  created.value = undefined;
  open.value = false;
}

async function save() {
  if (!canSubmit.value || conflict.value) {
    return;
  }
  busy.value = true;
  issue.value = '';
  let submitted = false;
  const { signal } = request;
  try {
    const csrf = await formToken(signal);
    if (created.value) {
      await openCreatedTrip(created.value);
      return;
    }
    commandKey ||= crypto.randomUUID();
    const command = { key: commandKey, csrf, signal };
    const body = tripSettingsBody(fields);
    submitted = true;
    const saved = base.value
      ? await editorApi.updateTrip(base.value.trip_id, tripSettingsPatch(base.value, body), command)
      : await editorApi.createTrip(body, command);
    await formToken(signal);
    uncertain.value = false;
    commandKey = '';
    if (base.value) {
      emit('saved', saved);
      open.value = false;
    }
    else {
      created.value = saved;
      await openCreatedTrip(saved);
    }
  }
  catch (error) {
    if (!signal.aborted) {
      if (submitted && !created.value) {
        uncertain.value = !(error instanceof EditorResponseError) || error.status >= 500;
        if (!uncertain.value) {
          commandKey = '';
        }
      }
      showError(error);
    }
  }
  finally {
    busy.value = false;
  }
}

onBeforeUnmount(() => {
  request.abort();
  open.value = false;
});
</script>

<template>
  <UiDialog
    class="trip-dialog"
    layout="landscape"
    :model-value="open"
    size="xlarge"
    :title="t(draft ? 'tripDrafts.settings' : 'workspace.createTrip')"
    @update:model-value="closeDialog"
  >
    <form
      v-if="open"
      class="trip-settings"
      novalidate
      @submit.prevent="save"
    >
      <div v-if="sessionReady" class="trip-settings-columns">
        <section :aria-label="t('tripDrafts.basics')" class="trip-basics">
          <UiTextField
            v-model="fields.title"
            autocomplete="off"
            :disabled="locked"
            :error="errors.title"
            :label="t('tripDrafts.title')"
            name="title"
            required
            @blur="touch('title')"
          />
          <TripCoverField
            :key="base?.trip_revision_id"
            v-model="fields.cover"
            :disabled="locked"
            :existing-url="base?.cover_id ? `/api/v1/trips/${base.trip_id}/covers/${base.cover_id}` : undefined"
            @blocked="coverBlocked = $event"
          />
          <UiTextField
            v-model="fields.description"
            :disabled="locked"
            :error="errors.description"
            :label="t('tripDrafts.description')"
            name="description"
            :rows="3"
            @blur="touch('description')"
          />
          <div class="trip-parameters">
            <UiDateRange
              v-model:end="fields.end_date"
              v-model:start="fields.start_date"
              :disabled="locked"
              :error="errors.dates"
              :hint="schedule.shift ? t('tripDrafts.dayShift') : undefined"
              :label="t('tripDrafts.dates')"
              :placeholder="t('tripDrafts.noDates')"
              :start-only-label="t('tripDrafts.useStart')"
              @blur="touch('dates')"
            />
            <div class="tk-field">
              <label class="tk-label" :for="id + 'capacity'">{{ t('tripDrafts.capacity') }}</label>
              <div class="trip-capacity">
                <button
                  :aria-label="t('tripDrafts.fewerPlaces')"
                  class="tk-button tk-icon-button"
                  :disabled="locked || Number(fields.free_capacity) <= 1"
                  type="button"
                  @click="stepCapacity(-1)"
                >−</button>
                <input
                  :id="id + 'capacity'"
                  ref="capacityInput"
                  :aria-describedby="errors.free_capacity ? id + 'capacity-error' : undefined"
                  :aria-invalid="errors.free_capacity ? true : undefined"
                  class="tk-input"
                  :disabled="locked"
                  inputmode="numeric"
                  :max="maxCapacity"
                  min="1"
                  name="free_capacity"
                  :placeholder="t('tripDrafts.capacityUnset')"
                  step="1"
                  type="number"
                  :value="fields.free_capacity"
                  @blur="touch('free_capacity')"
                  @input="readCapacity"
                >
                <button
                  :aria-label="t('tripDrafts.morePlaces')"
                  class="tk-button tk-icon-button"
                  :disabled="locked || Number(fields.free_capacity) >= maxCapacity"
                  type="button"
                  @click="stepCapacity(1)"
                >+</button>
              </div>
              <p
                v-if="errors.free_capacity"
                :id="id + 'capacity-error'"
                class="tk-field-error"
                role="alert"
              >{{ errors.free_capacity }}</p>
            </div>
          </div>
        </section>
        <TripEquipmentField
          :key="base?.trip_revision_id"
          v-model="fields.equipment"
          :disabled="locked"
          :form-token="formToken"
          @session-error="sessionError"
          @unfinished="gearUnfinished = $event"
        />
      </div>
      <div v-else-if="!issue" class="trip-settings-columns trip-settings-loading" role="status">
        <span class="tk-sr-only">{{ t('identity.loading') }}</span>
        <div aria-hidden="true" class="trip-basics">
          <UiSkeleton class="skeleton-text-input" />
          <div class="skeleton-stack">
            <UiSkeleton class="skeleton-cover" />
            <UiSkeleton class="skeleton-caption" />
          </div>
          <UiSkeleton class="skeleton-description" />
          <div class="trip-parameters">
            <div v-for="index in 2" :key="index" class="skeleton-stack">
              <UiSkeleton class="skeleton-caption" />
              <UiSkeleton class="skeleton-field" />
            </div>
          </div>
        </div>
        <div aria-hidden="true" class="skeleton-gear">
          <UiSkeleton class="skeleton-gear-intro" />
          <div class="skeleton-stack">
            <UiSkeleton class="skeleton-heading" />
            <UiSkeleton class="skeleton-caption" />
          </div>
          <UiSkeleton class="skeleton-field" />
          <div class="skeleton-options">
            <UiSkeleton class="skeleton-field" />
            <UiSkeleton class="skeleton-field" />
          </div>
          <UiSkeleton class="skeleton-caption" />
          <div class="skeleton-options">
            <UiSkeleton v-for="index in 8" :key="index" class="skeleton-field" />
          </div>
        </div>
      </div>
      <div v-else class="trip-settings-load-error">
        <p class="tk-field-error" role="alert">{{ issue }}</p>
        <button class="tk-button" type="button" @click="loadAttempt++">{{ t('identity.retry') }}</button>
      </div>
      <footer class="trip-settings-actions">
        <p v-if="sessionReady && issue" class="tk-field-error" role="alert">{{ issue }}</p>
        <button
          v-if="sessionReady && conflict"
          class="tk-button"
          :disabled="busy"
          type="button"
          @click="refreshDraft"
        >{{ t('tripDrafts.reload') }}</button>
        <button
          v-else
          class="tk-button tk-button-primary"
          :disabled="!canSubmit"
          type="submit"
        >
          {{ t(busy ? 'tripDrafts.saving' : uncertain ? 'identity.retry' : created ? 'tripDrafts.openEditor' : draft ? 'identity.save' : 'tripDrafts.createAndOpen') }}
        </button>
      </footer>
    </form>
  </UiDialog>
</template>

<style scoped>
.trip-dialog.tk-dialog { overflow: clip; }
.trip-dialog :deep(.tk-dialog-inner) { display: flex; flex-direction: column; block-size: 100%; box-sizing: border-box; }
.trip-dialog :deep(.tk-dialog-header) { flex: none; }
.trip-settings { display: flex; flex: 1; flex-direction: column; min-height: 0; gap: var(--tk-space-4); }
.trip-settings-columns, .trip-basics, .trip-parameters { display: grid; align-content: start; min-width: 0; gap: var(--tk-space-4); }
.trip-settings-columns { position: relative; flex: 1; min-height: 0; gap: var(--tk-space-5); padding: 3px; overflow-y: auto; scrollbar-gutter: stable; overscroll-behavior-y: contain; }
.trip-basics { container-type: inline-size; }
.trip-settings-load-error { display: grid; flex: 1; place-content: center; justify-items: center; gap: var(--tk-space-3); text-align: center; }
.trip-settings-load-error p { margin: 0; }
.skeleton-stack, .skeleton-gear, .skeleton-options { display: grid; align-content: start; gap: var(--tk-space-2); }
.skeleton-gear { gap: var(--tk-space-3); }
.skeleton-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.skeleton-heading { inline-size: 10rem; max-inline-size: 60%; block-size: 1.5rem; }
.skeleton-field { block-size: var(--tk-target); }
.skeleton-text-input { block-size: var(--tk-text-input-height); }
.skeleton-cover { block-size: clamp(7.5rem, 19dvh, 11rem); }
.skeleton-description { block-size: 5.75rem; }
.skeleton-gear-intro { block-size: 6rem; }
.skeleton-caption { inline-size: 7rem; max-inline-size: 65%; block-size: .85rem; }
.trip-settings-actions { display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--tk-space-3); padding-top: var(--tk-space-4); border-top: 1px solid var(--tk-line); }
.trip-settings-actions p { flex: 1 1 16rem; margin: 0; }
.trip-settings-actions a { text-decoration: none; }
@media (min-width: 800px) {
  .trip-settings-columns { grid-template: minmax(0, 1fr) / repeat(2, minmax(0, 1fr)); overflow: clip; scrollbar-gutter: auto; }
  .trip-basics { overflow-y: auto; padding: 3px var(--tk-space-5) 3px 3px; border-inline-end: 1px solid var(--tk-line); }
  .skeleton-gear { overflow: clip; }
}
@media (min-width: 1024px) {
  .trip-settings-columns { grid-template-columns: minmax(0, 35fr) minmax(0, 65fr); }
}
@container (min-width: 25rem) {
  .trip-parameters { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); align-items: start; }
}
@media (max-width: 639px) {
  .trip-settings-actions > .tk-button { width: 100%; }
}
.trip-settings .tk-input { min-width: 0; }
.trip-capacity { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--tk-space-2); }
.trip-capacity .tk-button { color: var(--tk-accent); font-size: 1.25rem; }
.trip-capacity input { appearance: textfield; text-align: center; font-variant-numeric: tabular-nums; }
.trip-capacity input::-webkit-inner-spin-button, .trip-capacity input::-webkit-outer-spin-button { appearance: none; }
</style>
