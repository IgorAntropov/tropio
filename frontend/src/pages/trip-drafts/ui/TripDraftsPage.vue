<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { TripPublication } from '@fsd/features/publish-trip';
import {
  TripDraftDialog,
  useTripCreation,
} from '@fsd/features/trip-draft-dialog';
import {
  canRetryRead,
  editorApi,
  readFailureStatus,
} from '@fsd/shared/api';
import { SystemErrorState } from '@fsd/shared/ui/page-error';
import { WorkspacePage } from '@fsd/shared/ui/workspace-page/index';
import type {
  MyTripDraftList,
  TravelDraft,
} from '@fsd/shared/api';
import {
  describeEditorError,
  editorProblemCode,
} from '@fsd/features/edit-route';
import {
  dayRoutePath,
  tripDraftPath,
} from '../paths';
import '@fsd/shared/ui/kit/kit.css';

const props = defineProps<{ tripId?: string }>();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const result = shallowRef<MyTripDraftList | null>(null);
const draft = shallowRef<TravelDraft | null>(null);
const issue = ref('');
const readStatus = ref<number>();
const signedOut = ref(false);
const loading = ref(true);
const creating = useTripCreation();
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

async function load(append = false) {
  loading.value = true;
  issue.value = '';
  readStatus.value = undefined;
  signedOut.value = false;
  try {
    if (props.tripId) {
      draft.value = await editorApi.getTrip(props.tripId, request.signal);
    }
    else {
      const cursor = append ? result.value?.next_cursor : null;
      const page = await editorApi.listTrips(cursor ? { cursor } : undefined, request.signal);
      result.value = append ? { ...page, items: [...(result.value?.items ?? []), ...page.items] } : page;
    }
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
  watch(() => route.query.new, (value) => {
    if (props.tripId || route.path !== '/trips' || value !== '1') {
      return;
    }
    creating.value = true;
    const query = { ...route.query };
    delete query.new;
    void router.replace({ path: route.path, query, hash: route.hash });
  }, { immediate: true });
});
onBeforeUnmount(() => request.abort());
</script>

<template>
  <WorkspacePage class="trip-workspace">
    <SystemErrorState
      v-if="readStatus && !draft && !result"
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
      <NuxtLink class="tk-button" :to="tripId ? '/trips' : '/feed'">{{ t(tripId ? 'workspace.trips' : 'workspace.feed.title') }}</NuxtLink>
    </SystemErrorState>
    <div v-else class="workspace-page-body trip-workspace__content">
      <NuxtLink v-if="tripId" class="trip-workspace__back" to="/trips">
        ← {{ t('workspace.trips') }}
      </NuxtLink>
      <header>
        <h1 class="workspace-page-title">{{ tripId ? (draft?.title || t('tripDrafts.programTitle')) : t('workspace.trips') }}</h1>
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
      <TripPublication
        v-if="draft"
        :key="settingsRevision || draft.trip_id"
        ref="publication"
        :draft="draft"
        @denied="denied"
        @refresh="draft = $event"
      />
      <section v-else-if="!tripId && result" :aria-label="t('workspace.trips')">
        <p v-if="!result.items.length">Здесь будут твои путешествия.</p>
        <ul v-else class="trip-workspace__list">
          <li v-for="item in result.items" :key="item.trip_id">
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ t(item.publication_id ? 'tripDrafts.status.published' : 'tripDrafts.status.draft') }}</p>
            </div>
            <NuxtLink class="tk-button" :to="tripDraftPath(item.trip_id)">Открыть</NuxtLink>
          </li>
        </ul>
        <button
          v-if="result.next_cursor"
          class="tk-button"
          :disabled="loading"
          type="button"
          @click="load(true)"
        >Показать ещё</button>
      </section>
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
