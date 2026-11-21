<script setup lang="ts">
import {
  computed,
  ref,
} from 'vue';
import type { TravelDraft } from '@fsd/shared/api';
import {
  UiDialog,
  UiSegmented,
} from '@fsd/shared/ui/kit';
import { useTripPublication } from './use-trip-publication';

const props = defineProps<{ draft: TravelDraft }>();
const emit = defineEmits<{ refresh: [draft: TravelDraft]; denied: [error: unknown] }>();
const { t, te } = useI18n();
const current = shallowRef(props.draft);
watch(() => props.draft, (draft) => {
  current.value = draft;
});
const {
  action, busy, conflict, issue, locked, missingPois, needsRead, nextPois, notice, operation, pois, prepared, publishedState, selected, unavailable, unchanged,
  morePois, prepare, publish, retry, setAdmissionMode, setVisibility, withdraw,
} = useTripPublication(() => current.value, (draft) => {
  current.value = draft;
  emit('refresh', draft);
}, error => emit('denied', error));
defineExpose({ locked });
const savedMode = computed(() => current.value.admission_mode ?? 'request');
const selectedMode = ref<string>(savedMode.value);
const modeOptions = computed(() => [
  { value: 'request', label: t('publication.admissionRequest') },
  { value: 'open', label: t('publication.admissionOpen') },
]);
watch(savedMode, (mode) => {
  selectedMode.value = mode;
});
const confirmation = ref<'withdraw' | 'private' | null>(null);
const dialog = computed({ get: () => confirmation.value !== null, set: (open) => {
  if (!open) {
    confirmation.value = null;
  }
} });
function confirm() {
  const choice = confirmation.value;
  dialog.value = false;
  if (choice === 'withdraw') {
    void withdraw();
  }
  if (choice === 'private') {
    void setVisibility('private');
  }
}
const issueText = computed(() => t(te('publication.errors.' + issue.value) ? 'publication.errors.' + issue.value : 'publication.errors.UNKNOWN'));
const publishLabel = computed(() => {
  if (!props.draft.publication_id) {
    return prepared.value ? 'publish' : 'prepare';
  }
  if (publishedState.value === 'current' && !prepared.value) {
    return 'choosePois';
  }
  return 'publishChanges';
});
</script>

<template>
  <section v-if="!unavailable" :aria-label="t('publication.admission')" class="publication trip-admission">
    <h2>{{ t('publication.admission') }}</h2>
    <form class="publication-actions" @submit.prevent="setAdmissionMode(selectedMode)">
      <UiSegmented
        v-model="selectedMode"
        :disabled="locked || conflict || !!prepared"
        :label="t('publication.admission')"
        :options="modeOptions"
      />
      <button class="tk-button" :disabled="locked || conflict || !!prepared || selectedMode === savedMode" type="submit">{{ t('publication.admissionSave') }}</button>
    </form>
    <p v-if="draft.publication_id">{{ t('publication.admissionPublishHint') }}</p>
    <p v-if="notice === 'admissionSaved'" role="status">{{ t('publication.admissionSaved') }}</p>
  </section>
  <section :aria-label="t('publication.title')" class="publication">
    <div class="publication-heading">
      <span aria-hidden="true" class="publication-symbol">↗</span>
      <div><h2>{{ t('publication.title') }}</h2><p>{{ t('publication.snapshotHint') }}</p></div>
    </div>
    <div v-if="!unavailable" class="publication-state">
      <strong>{{ t(operation ? 'publication.preparing' : draft.publication_id ? 'publication.' + publishedState : 'publication.draft') }}</strong>
      <NuxtLink v-if="draft.publication_id" :to="`/catalog/${draft.trip_id}`">{{ t('publication.open') }} ↗</NuxtLink>
    </div>
    <p v-if="issue" class="publication-issue" role="alert">{{ issueText }}</p>
    <p v-else-if="busy || (notice && notice !== 'admissionSaved')" role="status">{{ t(busy ? 'publication.processing' : 'publication.' + notice) }}</p>
    <fieldset v-if="prepared && !issue" class="publication-pois" :disabled="locked">
      <legend>{{ t('publication.pois') }}</legend>
      <p>{{ t(pois.length ? 'publication.poiHint' : 'publication.noPois') }}</p>
      <p v-if="missingPois" role="status">{{ t('publication.missingPois') }}</p>
      <label v-for="poi in pois" :key="poi.id"><input
        v-model="selected"
        :disabled="selected.length >= 500 && !selected.includes(poi.id)"
        type="checkbox"
        :value="poi.id"
      > {{ poi.name }}</label>
      <button
        v-if="nextPois"
        class="tk-button tk-button-text"
        type="button"
        @click="morePois"
      >{{ t('catalog.more') }}</button>
    </fieldset>
    <div class="publication-actions">
      <button
        v-if="issue"
        class="tk-button"
        :disabled="busy"
        type="button"
        @click="retry"
      >{{ t(conflict || needsRead || unavailable ? 'publication.refresh' : 'catalog.retry') }}</button>
      <template v-if="!unavailable && !conflict && !needsRead">
        <button
          v-if="draft.visibility === 'private'"
          class="tk-button tk-button-primary"
          :disabled="locked"
          type="button"
          @click="setVisibility('public')"
        >{{ t('publication.allow') }}</button>
        <template v-else>
          <button
            v-if="!operation && !issue"
            class="tk-button tk-button-primary"
            :disabled="locked || unchanged || selectedMode !== savedMode"
            type="button"
            @click="prepared ? publish() : prepare()"
          >
            {{ t('publication.' + publishLabel) }}
          </button>
          <button
            v-if="prepared && !operation && !action"
            class="tk-button tk-button-text"
            :disabled="busy"
            type="button"
            @click="prepared = null"
          >{{ t('publication.close') }}</button>
          <button
            v-if="draft.publication_id || operation"
            class="tk-button"
            :disabled="busy || !!action"
            type="button"
            @click="confirmation = 'withdraw'"
          >{{ t(operation && !draft.publication_id ? 'publication.cancel' : 'publication.withdraw') }}</button>
          <button
            v-if="!operation && !prepared"
            class="tk-button tk-button-text"
            :disabled="locked"
            type="button"
            @click="confirmation = 'private'"
          >{{ t('publication.makePrivate') }}</button>
        </template>
      </template>
    </div>
    <UiDialog v-model="dialog" layout="confirmation" :title="t(confirmation === 'private' ? 'publication.privateConfirm' : 'publication.withdrawConfirm')">
      <p>{{ t('publication.confirmHint') }}</p>
      <div class="publication-actions"><button class="tk-button" type="button" @click="dialog = false">{{ t('publication.keep') }}</button><button class="tk-button tk-button-primary" type="button" @click="confirm">{{ t('publication.confirm') }}</button></div>
    </UiDialog>
  </section>
</template>

<style scoped>
.publication { margin-top: 1.75rem; padding: clamp(1rem, 3vw, 1.65rem); background: var(--tk-surface); border: 1px solid var(--tk-line); border-radius: var(--tk-radius-panel); }
.publication-heading, .publication-actions, .publication-state { display: flex; align-items: center; gap: .8rem; }
.publication-heading h2 { margin: 0; font-size: 1.3rem; }
.trip-admission { display: grid; gap: var(--tk-space-3); }
.trip-admission h2 { margin: 0; font-size: 1.25rem; }
.trip-admission p { margin: 0; color: var(--tk-muted); }
.trip-admission :deep(.tk-segmented) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: min(100%, 19rem); }
.trip-admission :deep(.tk-segment > span) { padding-inline: var(--tk-space-2); font-size: var(--tk-text-sm); text-align: center; }
.publication-heading p, .publication-pois p { margin: .3rem 0 0; color: var(--tk-muted); }
.publication-symbol { display: grid; place-items: center; width: 2.8rem; height: 2.8rem; flex-shrink: 0; border-radius: 12px; background: var(--tk-selected); color: var(--tk-accent); font-size: 1.65rem; }
.publication-state { flex-wrap: wrap; justify-content: space-between; margin: 1rem 0; padding: .95rem 0; border-block: 1px solid var(--tk-line); }
.publication-state a { color: var(--tk-accent); }
.publication-pois { margin: 1rem 0; padding: .8rem 1rem; border: 1px solid var(--tk-line); border-radius: var(--tk-radius); }
.publication-pois label { display: flex; gap: .45rem; align-items: center; min-height: 44px; }
.publication-pois input { accent-color: var(--tk-accent); }
.publication-actions { flex-wrap: wrap; }
.publication-issue { color: var(--tk-danger); }
</style>
