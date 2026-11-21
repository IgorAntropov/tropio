<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  useId,
  watch,
} from 'vue';
import {
  editorApi,
  EditorResponseError,
  identityApi,
  IdentityResponseError,
} from '@fsd/shared/api';
import type { TravelDraft } from '@fsd/shared/api';
import { UiDateRange } from '@fsd/shared/ui/date-range';
import {
  hasInvalidText,
  useFormValidation,
} from '@fsd/shared/ui/form';
import {
  UiDialog,
  UiTextField,
} from '@fsd/shared/ui/kit';
import {
  tripDaySchedule,
  tripSettings,
  tripSettingsBody,
  tripSettingsPatch,
  useCreatedTripDay,
} from '../model';

const props = defineProps<{ draft?: TravelDraft }>();
const emit = defineEmits<{ saved: [draft: TravelDraft] }>();
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const router = useRouter();
const id = useId();
const fields = reactive(tripSettings());
const base = shallowRef<TravelDraft>();
const created = shallowRef<TravelDraft>();
const createdDay = useCreatedTripDay();
const busy = ref(false);
const uncertain = ref(false);
const signedOut = ref(false);
const conflict = ref(false);
const issue = ref('');
const request = new AbortController();
let commandKey = '';

const locked = computed(() => busy.value || uncertain.value || !!created.value || signedOut.value || conflict.value);
const login = computed(() => ({
  path: '/login',
  query: { returnTo: base.value ? `/trips/${base.value.trip_id}` : '/trips?new=1' },
}));
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
    if (capacity && (!/^\d+$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > 2147483647)) {
      return t('tripDrafts.invalidCapacity');
    }
  },
});

function setFields(draft?: TravelDraft) {
  base.value = draft;
  Object.assign(fields, tripSettings(draft));
  conflict.value = false;
  signedOut.value = false;
  issue.value = '';
  commandKey = '';
  reset();
}

watch(open, (opening) => {
  if (opening && !uncertain.value && !created.value) {
    setFields(props.draft);
  }
}, { immediate: true });

function closeDialog() {
  if (!busy.value) {
    created.value = undefined;
    open.value = false;
  }
}

function showError(error: unknown) {
  if (error instanceof EditorResponseError || error instanceof IdentityResponseError) {
    signedOut.value = error.status === 401;
    if (signedOut.value) {
      issue.value = t('tripDrafts.sessionExpired');
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
  try {
    const fresh = await editorApi.getTrip(base.value.trip_id, request.signal);
    setFields(fresh);
    emit('saved', fresh);
  }
  catch (error) {
    if (!request.signal.aborted) {
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
  if (busy.value || signedOut.value || conflict.value || !valid.value || !modified.value) {
    return;
  }
  busy.value = true;
  issue.value = '';
  let submitted = false;
  try {
    if (created.value) {
      await openCreatedTrip(created.value);
      return;
    }
    const session = await identityApi.me(request.signal);
    commandKey ||= crypto.randomUUID();
    const command = { key: commandKey, csrf: session.csrf_token, signal: request.signal };
    const body = tripSettingsBody(fields);
    submitted = true;
    const saved = base.value
      ? await editorApi.updateTrip(base.value.trip_id, tripSettingsPatch(base.value, body), command)
      : await editorApi.createTrip(body, command);
    if (request.signal.aborted) {
      return;
    }
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
    if (!request.signal.aborted) {
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
    :model-value="open"
    :title="t(draft ? 'tripDrafts.settings' : 'workspace.createTrip')"
    @update:model-value="closeDialog"
  >
    <form
      v-if="open"
      class="trip-settings"
      novalidate
      @submit.prevent="save"
    >
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
      <UiTextField
        v-model="fields.description"
        :disabled="locked"
        :error="errors.description"
        :label="t('tripDrafts.description')"
        name="description"
        :rows="3"
        @blur="touch('description')"
      />
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
        <input
          :id="id + 'capacity'"
          v-model="fields.free_capacity"
          :aria-describedby="errors.free_capacity ? id + 'capacity-error' : undefined"
          :aria-invalid="errors.free_capacity ? true : undefined"
          class="tk-input"
          :disabled="locked"
          inputmode="numeric"
          name="free_capacity"
          type="text"
          @blur="touch('free_capacity')"
        >
        <p
          v-if="errors.free_capacity"
          :id="id + 'capacity-error'"
          class="tk-field-error"
          role="alert"
        >{{ errors.free_capacity }}</p>
      </div>
      <p v-if="issue" class="tk-field-error" role="alert">{{ issue }}</p>
      <NuxtLink v-if="signedOut" class="tk-button tk-button-primary" :to="login">{{ t('identity.login.submit') }}</NuxtLink>
      <button
        v-else-if="conflict"
        class="tk-button"
        :disabled="busy"
        type="button"
        @click="refreshDraft"
      >{{ t('tripDrafts.reload') }}</button>
      <button
        v-else
        class="tk-button tk-button-primary"
        :disabled="busy || !valid || !modified"
        type="submit"
      >
        {{ t(busy ? 'tripDrafts.saving' : uncertain ? 'identity.retry' : created ? 'tripDrafts.openEditor' : draft ? 'identity.save' : 'tripDrafts.createAndOpen') }}
      </button>
    </form>
  </UiDialog>
</template>

<style scoped>
.trip-settings { display: grid; gap: var(--tk-space-4); }
.trip-settings .tk-input { min-width: 0; }
.trip-settings > .tk-button { margin-top: var(--tk-space-2); text-decoration: none; }
</style>
