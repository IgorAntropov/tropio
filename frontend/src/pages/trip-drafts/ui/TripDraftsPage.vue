<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { TripPublication } from '@fsd/features/publish-trip';
import {
  editorApi,
  identityApi,
} from '@fsd/shared/api';
import type {
  CreateTripDraftRequest,
  MyTripDraftList,
  TravelDraft,
} from '@fsd/shared/api';
import {
  describeEditorError,
  editorProblemCode,
} from '@fsd/features/edit-route';
import {
  hasInvalidText,
  useFormValidation,
} from '@fsd/shared/ui/form';
import { UiTextField } from '@fsd/shared/ui/kit';
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
const signedOut = ref(false);
const loading = ref(true);
const creating = ref(false);
const busy = ref(false);
const title = ref('');
const { valid, errors, touch, reset: resetValidation } = useFormValidation({
  title: () => {
    const value = title.value.trim();
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
});
const request = new AbortController();
let pendingCreate: { body: CreateTripDraftRequest; key: string } | null = null;

function denied(error: unknown) {
  draft.value = null;
  failure(error);
}

function failure(error: unknown) {
  if (request.signal.aborted) {
    return;
  }
  signedOut.value = editorProblemCode(error) === 'SESSION_REQUIRED';
  issue.value = describeEditorError(error);
}

async function load(append = false) {
  loading.value = true;
  issue.value = '';
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

async function createTrip() {
  if (busy.value || !valid.value) {
    return;
  }
  const normalized = title.value.trim();
  if (!pendingCreate || pendingCreate.body.title !== normalized) {
    pendingCreate = { body: { title: normalized }, key: crypto.randomUUID() };
  }
  busy.value = true;
  issue.value = '';
  try {
    const session = await identityApi.me(request.signal);
    const created = await editorApi.createTrip(pendingCreate.body, {
      csrf: session.csrf_token,
      key: pendingCreate.key,
      signal: request.signal,
    });
    await router.push(tripDraftPath(created.trip_id));
  }
  catch (error) {
    failure(error);
  }
  finally {
    busy.value = false;
  }
}

function toggleCreation() {
  creating.value = !creating.value;
  if (!creating.value) {
    resetValidation();
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
  <main class="trip-workspace">
    <div class="trip-workspace__content">
      <NuxtLink class="trip-workspace__back" :to="tripId ? '/trips' : '/'">
        ← {{ tripId ? 'Мои путешествия' : 'Тропио' }}
      </NuxtLink>
      <header>
        <h1>{{ tripId ? (draft?.title || 'Путешествие') : 'Мои путешествия' }}</h1>
        <button
          v-if="!tripId && !signedOut"
          class="tk-button tk-button-primary"
          type="button"
          @click="toggleCreation"
        >
          {{ creating ? 'Закрыть форму' : 'Создать путешествие' }}
        </button>
      </header>
      <p v-if="issue" class="trip-workspace__message" role="alert">{{ issue }}</p>
      <NuxtLink v-if="signedOut" class="tk-button tk-button-primary" to="/login">Войти</NuxtLink>
      <button
        v-else-if="issue && !creating"
        class="tk-button"
        :disabled="loading"
        type="button"
        @click="load()"
      >Повторить</button>
      <form
        v-if="creating && !signedOut"
        class="trip-workspace__form"
        novalidate
        @submit.prevent="createTrip"
      >
        <UiTextField
          v-model="title"
          autocomplete="off"
          class="trip-workspace__title"
          :disabled="busy"
          :error="errors.title"
          :label="t('tripDrafts.title')"
          :maxlength="240"
          name="title"
          required
          @blur="touch('title')"
        />
        <button class="tk-button tk-button-primary" :disabled="busy || !valid" type="submit">
          {{ busy ? 'Создаём…' : 'Создать черновик' }}
        </button>
      </form>
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
        :key="draft.trip_id"
        :draft="draft"
        @denied="denied"
        @refresh="draft = $event"
      />
      <section v-else-if="!tripId && result" aria-label="Черновики">
        <h2>Черновики</h2>
        <p v-if="!result.items.length">Здесь будут твои путешествия.</p>
        <ul v-else class="trip-workspace__list">
          <li v-for="item in result.items" :key="item.trip_id">
            <strong>{{ item.title }}</strong>
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
  </main>
</template>

<style scoped>
.trip-workspace { min-height: var(--workspace-content-height, 100dvh); background: var(--tk-canvas); color: var(--tk-ink); }
.trip-workspace__content { max-width: 56rem; margin: 0 auto; padding: clamp(1rem, 5vw, 4rem); }
.trip-workspace__content header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin: 1rem 0 2rem; }
.trip-workspace__content h1 { margin: 0; font-size: clamp(1.8rem, 4vw, 2.75rem); }
.trip-workspace__content h2 { font-size: 1.25rem; margin: 1.8rem 0 .9rem; }
.trip-workspace__back { color: var(--tk-accent); font-weight: 650; text-decoration: none; }
.trip-workspace__form { display: flex; gap: 1rem; align-items: start; padding: 1.25rem; background: var(--tk-surface); border: 1px solid var(--tk-line); border-radius: var(--tk-radius); }
.trip-workspace__title { flex: 1; }
.trip-workspace__list { list-style: none; display: grid; gap: .75rem; margin: 0 0 1rem; padding: 0; }
.trip-workspace__list li { display: flex; justify-content: space-between; flex-wrap: wrap; align-items: center; gap: .75rem; padding: 1rem; border: 1px solid var(--tk-line); border-radius: var(--tk-radius); background: var(--tk-surface); }
.trip-workspace__list p { margin: .35rem 0 0; white-space: pre-wrap; color: var(--tk-muted); }
.trip-workspace :deep(a.tk-button) { text-decoration: none; }
.trip-workspace__message { color: var(--tk-danger); }
@media (max-width: 520px) {
  .trip-workspace__form { flex-direction: column; align-items: stretch; }
}
</style>
