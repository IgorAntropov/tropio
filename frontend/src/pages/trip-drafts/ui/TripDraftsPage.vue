<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
} from 'vue';
import { TripPublication } from '@fsd/features/publish-trip';
import { TripDraftDialog } from '@fsd/features/trip-draft-dialog';
import { TripRoster } from '@fsd/features/trip-roster';
import {
  canRetryRead,
  editorApi,
  readFailureStatus,
} from '@fsd/shared/api';
import { accountTripsReturnPath } from '@fsd/shared/session';
import { SystemErrorState } from '@fsd/shared/ui/page-error';
import { WorkspacePage } from '@fsd/shared/ui/workspace-page/index';
import type { TravelDraft } from '@fsd/shared/api';
import {
  describeEditorError,
  editorProblemCode,
} from '@fsd/features/edit-route';
import { dayRoutePath } from '../paths';
import '@fsd/shared/ui/kit/kit.css';

const props = defineProps<{ tripId: string }>();
const { t } = useI18n();
const route = useRoute();
const returnPath = computed(() => accountTripsReturnPath(route.query.returnTo) ?? '/trips');
const draft = shallowRef<TravelDraft | null>(null);
const issue = ref('');
const readStatus = ref<number>();
const signedOut = ref(false);
const loading = ref(true);
const editing = ref(false);
const publication = useTemplateRef<InstanceType<typeof TripPublication>>('publication');
const settingsRevision = ref('');
const request = new AbortController();

function denied(error: unknown) {
  draft.value = null;
  failure(error);
}

function acceptSettings(saved: TravelDraft) {
  if (draft.value?.trip_revision_id !== saved.trip_revision_id) {
    settingsRevision.value = saved.trip_revision_id;
  }
  draft.value = saved;
}

function failure(error: unknown) {
  if (request.signal.aborted) {
    return;
  }
  signedOut.value = editorProblemCode(error) === 'SESSION_REQUIRED';
  readStatus.value = signedOut.value ? undefined : readFailureStatus(error);
  issue.value = describeEditorError(error);
}

async function load() {
  loading.value = true;
  issue.value = '';
  readStatus.value = undefined;
  signedOut.value = false;
  try {
    draft.value = await editorApi.getTrip(props.tripId, request.signal);
  }
  catch (error) {
    failure(error);
  }
  finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
onBeforeUnmount(() => request.abort());
</script>

<template>
  <WorkspacePage class="trip-workspace">
    <SystemErrorState
      v-if="readStatus && !draft"
      class="trip-workspace__unavailable"
      heading="h1"
      :status-code="readStatus"
    >
      <button
        v-if="canRetryRead(readStatus)"
        class="tk-button tk-button-primary"
        type="button"
        @click="load()"
      >{{ t('catalog.retry') }}</button>
      <NuxtLink class="tk-button" :to="returnPath">{{ t('workspace.trips') }}</NuxtLink>
    </SystemErrorState>
    <div v-else class="workspace-page-body trip-workspace__content">
      <NuxtLink class="trip-workspace__back" :to="returnPath">
        ← {{ t('workspace.trips') }}
      </NuxtLink>
      <header>
        <h1 class="workspace-page-title">{{ draft?.title || t('tripDrafts.programTitle') }}</h1>
        <button
          v-if="draft"
          class="tk-button"
          :disabled="publication?.locked"
          type="button"
          @click="editing = true"
        >{{ t('tripDrafts.settings') }}</button>
      </header>
      <TripDraftDialog
        v-if="draft"
        v-model="editing"
        :draft="draft"
        @saved="acceptSettings"
      />
      <p v-if="issue" class="trip-workspace__message" role="alert">{{ issue }}</p>
      <NuxtLink v-if="signedOut" class="tk-button tk-button-primary" :to="{ path: '/login', query: { returnTo: route.fullPath } }">{{ t('identity.login.submit') }}</NuxtLink>
      <button
        v-else-if="issue"
        class="tk-button"
        :disabled="loading"
        type="button"
        @click="load()"
      >Повторить</button>
      <p v-if="loading" role="status">Загружаем…</p>
      <section v-if="draft" aria-label="Программа по дням">
        <h2>Программа по дням</h2>
        <ul class="trip-workspace__list">
          <li v-for="day in draft.days" :key="day.day_id">
            <div>
              <strong>День {{ day.position }}</strong>
              <p v-if="day.description">{{ day.description }}</p>
            </div>
            <NuxtLink class="tk-button" :to="dayRoutePath(draft.trip_id, day.day_id)">
              {{ day.route_id ? 'Открыть маршрут' : 'Построить маршрут' }}
            </NuxtLink>
          </li>
        </ul>
      </section>
      <TripRoster v-if="draft" :revision="draft.trip_revision_id" :trip-id="draft.trip_id" />
      <TripPublication
        v-if="draft"
        :key="settingsRevision || draft.trip_id"
        ref="publication"
        :draft="draft"
        @denied="denied"
        @refresh="draft = $event"
      />
    </div>
  </WorkspacePage>
</template>

<style scoped>
.trip-workspace__unavailable { min-block-size: 100%; }
.trip-workspace__content { overflow-wrap: anywhere; }
.trip-workspace__content header { display: flex; justify-content: space-between; align-items: center; gap: var(--tk-space-4); flex-wrap: wrap; margin-block-end: var(--tk-space-5); }
.trip-workspace__content h2 { font-size: var(--tk-text-lg); margin: var(--tk-space-5) 0 var(--tk-space-3); }
.trip-workspace__back { color: var(--tk-accent); font-weight: 650; text-decoration: none; }
.trip-workspace__back + header { margin-block-start: var(--tk-space-3); }
.trip-workspace__list { list-style: none; display: grid; gap: .75rem; margin: 0 0 1rem; padding: 0; }
.trip-workspace__list li { display: flex; justify-content: space-between; flex-wrap: wrap; align-items: center; gap: .75rem; padding: 1rem; border: 1px solid var(--tk-line); border-radius: var(--tk-radius); background: var(--tk-surface); }
.trip-workspace__list p { margin: .35rem 0 0; white-space: pre-wrap; color: var(--tk-muted); }
.trip-workspace :deep(a.tk-button) { text-decoration: none; }
.trip-workspace__message { color: var(--tk-danger); }
</style>
