<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { editorApi } from '@fsd/shared/api';
import type {
  EquipmentLibraryItem,
  TravelDraft,
} from '@fsd/shared/api';
import {
  UiImage,
  UiSearchField,
  UiSegmented,
  UiSkeleton,
  UiTextField,
} from '@fsd/shared/ui/kit';
import {
  equipmentFolderPath,
  equipmentFolders,
  equipmentNameKey,
  validEquipmentName,
} from '../equipment-library';
import type { EquipmentFolder } from '../equipment-library';
import EquipmentIcon from './EquipmentIcon.vue';
import PersonalEquipmentDialog from './PersonalEquipmentDialog.vue';

const props = defineProps<{ disabled: boolean; formToken: (signal: AbortSignal) => Promise<string> }>();
const items = defineModel<TravelDraft['equipment']>({ required: true });
const emit = defineEmits<{ unfinished: [value: boolean]; sessionError: [error: unknown] }>();
const { t } = useI18n();
const id = useId();
const region = useTemplateRef<HTMLElement>('region');
const search = useTemplateRef<InstanceType<typeof UiSearchField>>('search');
const addOwnButton = useTemplateRef<HTMLButtonElement>('addOwnButton');
const query = ref('');
const scope = ref('all');
const library = shallowRef<EquipmentLibraryItem[]>([]);
const categories = shallowRef<Awaited<ReturnType<typeof editorApi.listEquipment>>['categories']>([]);
const category = ref<EquipmentLibraryItem['category']>();
const group = ref<EquipmentFolder>();
const subgroup = ref<EquipmentFolder>();
const showCategories = computed(() => scope.value === 'all' && !query.value.trim() && !category.value);
const categoryLabel = computed(() => categories.value.find(group => group.id === category.value)?.label);
const groupLabels: Record<string, string> = { Общие: 'tripDrafts.gear.basic', Специальные: 'tripDrafts.gear.specialized' };
const categoryGroups = computed(() => [...new Set(categories.value.map(entry => entry.group))].map(group => ({
  label: groupLabels[group] ? t(groupLabels[group]) : group,
  entries: categories.value.filter(entry => entry.group === group),
})));
const categoryNames = computed(() => new Map(categories.value.map(entry => [entry.id, entry.label])));
watch(scope, () => {
  category.value = undefined;
  group.value = undefined;
  subgroup.value = undefined;
});
const loading = ref(true);
const loadIssue = ref(false);
const customOpen = ref(false);
const editing = ref<number>();
const editedName = ref('');
const editTouched = ref(false);
const announcement = ref('');
const request = new AbortController();
const selectedNames = computed(() => new Set(items.value.map(item => equipmentNameKey(item.label))));
const selectedSources = ref(new Map<string, EquipmentLibraryItem>());
const packedIcons = computed(() => {
  const sources = new Map<string, EquipmentLibraryItem | undefined>();
  for (const item of library.value) {
    const key = equipmentNameKey(item.label);
    sources.set(key, sources.has(key) ? undefined : item);
  }
  for (const [key, item] of selectedSources.value) {
    sources.set(key, item);
  }
  return new Map([...sources].map(([key, item]) => [key, item?.scope === 'personal' ? item.icon : undefined]));
});
const folders = computed(() => scope.value === 'personal' && !query.value.trim() && !subgroup.value
  ? equipmentFolders(library.value, group.value?.id)
  : []);
const available = computed(() => {
  const term = equipmentNameKey(query.value);
  return library.value.filter((item) => {
    const key = equipmentNameKey(item.label);
    if (selectedNames.value.has(key) || (scope.value === 'personal' && item.scope !== 'personal')) {
      return false;
    }
    if (term) {
      return key.includes(term);
    }
    return scope.value === 'personal'
      ? item.group?.id === group.value?.id && item.subgroup?.id === subgroup.value?.id
      : item.category === category.value;
  });
});
const options = computed(() => [
  { value: 'all', label: t('tripDrafts.gear.all') },
  { value: 'personal', label: t('tripDrafts.gear.personal') },
]);
const full = computed(() => items.value.length >= 50);
const pendingEdits = computed(() => editing.value !== undefined || customOpen.value);
watch(pendingEdits, value => emit('unfinished', value), { flush: 'sync' });

function labelIssue(label: string) {
  if (!label.trim()) {
    return t('tripDrafts.gear.empty');
  }
  if (!validEquipmentName(label)) {
    return t('tripDrafts.gear.invalid');
  }
  return '';
}

const editError = computed(() => labelIssue(editedName.value) || (items.value.some((item, index) =>
  index !== editing.value && equipmentNameKey(item.label) === equipmentNameKey(editedName.value))
  ? t('tripDrafts.gear.duplicate')
  : ''));

async function load() {
  loading.value = true;
  loadIssue.value = false;
  try {
    const result = await editorApi.listEquipment(request.signal);
    await props.formToken(request.signal);
    if (!request.signal.aborted) {
      const received = new Set(result.items.map(item => item.id));
      const addedWhileLoading = library.value.filter(item => item.scope === 'personal' && !received.has(item.id));
      library.value = [...result.items, ...addedWhileLoading];
      categories.value = result.categories;
    }
  }
  catch (error) {
    if (!request.signal.aborted) {
      loadIssue.value = true;
      emit('sessionError', error);
    }
  }
  finally {
    loading.value = false;
  }
}

function focus(selector: string) {
  const target = region.value?.querySelector<HTMLElement>(selector);
  (target ?? search.value)?.focus({ preventScroll: true });
}

async function openCategory(value?: EquipmentLibraryItem['category']) {
  const previous = category.value;
  category.value = value;
  await nextTick();
  focus(value ? '[data-gear-back]' : `[data-gear-category="${previous}"]`);
}

async function openFolder(folder: EquipmentFolder) {
  if (group.value) {
    subgroup.value = folder;
  }
  else {
    group.value = folder;
  }
  await nextTick();
  focus('[data-personal-back]');
}

async function parentFolder() {
  const previous = subgroup.value ?? group.value;
  if (subgroup.value) {
    subgroup.value = undefined;
  }
  else {
    group.value = undefined;
  }
  await nextTick();
  focus(`[data-personal-folder="${previous?.id}"]`);
}

function detail(item: EquipmentLibraryItem) {
  return item.scope === 'system' ? categoryNames.value.get(item.category) : equipmentFolderPath(item) || t('tripDrafts.gear.personal');
}

async function add(item: EquipmentLibraryItem) {
  const key = equipmentNameKey(item.label);
  if (props.disabled || full.value || selectedNames.value.has(key)) {
    return;
  }
  const index = available.value.findIndex(option => option.id === item.id);
  selectedSources.value.set(key, item);
  items.value = [...items.value, { label: item.label, required: false }];
  announcement.value = t('tripDrafts.gear.added', { name: item.label });
  await nextTick();
  const next = available.value[Math.min(index, available.value.length - 1)];
  focus(next && !full.value ? `[data-gear-id="${next.id}"]` : 'input[type="search"]');
}

async function remove(index: number) {
  const item = items.value[index];
  if (!item) {
    return;
  }
  selectedSources.value.delete(equipmentNameKey(item.label));
  items.value = items.value.filter((_, position) => position !== index);
  announcement.value = t('tripDrafts.gear.removed', { name: item.label });
  await nextTick();
  focus(`[data-gear-remove="${Math.min(index, items.value.length - 1)}"]`);
}

async function closeCustom() {
  customOpen.value = false;
  await nextTick();
  if (addOwnButton.value && !addOwnButton.value.disabled) {
    addOwnButton.value.focus({ preventScroll: true });
  }
  else {
    search.value?.focus({ preventScroll: true });
  }
}

async function acceptCustom(item: EquipmentLibraryItem) {
  if (!library.value.some(value => value.id === item.id)) {
    library.value = [...library.value, item];
  }
  const key = equipmentNameKey(item.label);
  if (selectedNames.value.has(key)) {
    selectedSources.value.set(key, item);
  }
  else {
    await add(item);
  }
  await closeCustom();
}

async function edit(index: number) {
  const item = items.value[index];
  if (!item) {
    return;
  }
  editing.value = index;
  editedName.value = item.label;
  editTouched.value = false;
  await nextTick();
  focus('[name="gear-edited-name"]');
}

async function finishEdit(save: boolean) {
  const index = editing.value;
  if (index === undefined || (save && editError.value)) {
    return;
  }
  if (save) {
    const old = items.value[index];
    const source = old && selectedSources.value.get(equipmentNameKey(old.label));
    if (source && old) {
      selectedSources.value.delete(equipmentNameKey(old.label));
      selectedSources.value.set(equipmentNameKey(editedName.value), source);
    }
    items.value = items.value.map((item, position) => position === index ? { ...item, label: editedName.value.trim() } : item);
  }
  editing.value = undefined;
  await nextTick();
  focus(`[data-gear-edit="${index}"]`);
}

onMounted(load);
onBeforeUnmount(() => request.abort());
</script>

<template>
  <section ref="region" :aria-labelledby="id + '-title'" class="trip-gear">
    <header class="gear-intro">
      <div>
        <h3 :id="id + '-title'">{{ t('tripDrafts.gear.title') }}</h3>
        <p>{{ t('tripDrafts.gear.intro') }}</p>
      </div>
      <UiImage
        alt=""
        class="gear-art"
        fit="contain"
        src="/equipment-kit.webp"
      />
    </header>
    <div class="gear-packed">
      <div class="gear-packed-title"><h4>{{ t('tripDrafts.gear.selected') }}</h4><span>{{ items.length }} / 50</span></div>
      <p v-if="!items.length" class="tk-field-hint">{{ t('tripDrafts.gear.selectedEmpty') }}</p>
      <TransitionGroup
        v-else
        class="gear-packed-list"
        name="gear-item"
        tag="ul"
      >
        <li v-for="(item, index) in items" :key="index + ':' + item.label">
          <div v-if="editing === index" class="gear-edit">
            <UiTextField
              v-model="editedName"
              :disabled="disabled"
              :error="editTouched ? editError : undefined"
              :label="t('tripDrafts.gear.editName')"
              name="gear-edited-name"
              @blur="editTouched = true"
              @keydown.enter.prevent="finishEdit(true)"
            />
            <div class="gear-actions">
              <button
                class="tk-button"
                :disabled="disabled"
                type="button"
                @click="finishEdit(false)"
              >{{ t('identity.cancel') }}</button>
              <button
                class="tk-button"
                :disabled="disabled || !!editError"
                type="button"
                @click="finishEdit(true)"
              >{{ t('identity.save') }}</button>
            </div>
          </div>
          <template v-else>
            <div class="gear-packed-info">
              <EquipmentIcon v-if="packedIcons.get(equipmentNameKey(item.label))" :category="packedIcons.get(equipmentNameKey(item.label))!" />
              <button
                :aria-label="t('tripDrafts.gear.edit', { name: item.label })"
                :data-gear-edit="index"
                :disabled="disabled || editing !== undefined || customOpen"
                type="button"
                @click="edit(index)"
              >{{ item.label }}</button>
              <label>
                <input
                  v-model="item.required"
                  :aria-label="t('tripDrafts.gear.requiredFor', { name: item.label })"
                  :disabled="disabled"
                  type="checkbox"
                >
                {{ t('tripDrafts.gear.required') }}
              </label>
            </div>
            <button
              :aria-label="t('tripDrafts.gear.remove', { name: item.label })"
              class="tk-button tk-button-text tk-icon-button"
              :data-gear-remove="index"
              :disabled="disabled || editing !== undefined || customOpen"
              type="button"
              @click="remove(index)"
            >×</button>
          </template>
        </li>
      </TransitionGroup>
    </div>
    <div class="gear-tools">
      <UiSearchField
        ref="search"
        v-model="query"
        :disabled="disabled"
        :label="t('tripDrafts.gear.search')"
      />
      <div class="gear-toolbar">
        <UiSegmented
          v-model="scope"
          :disabled="disabled"
          :label="t('tripDrafts.gear.source')"
          :options="options"
        />
        <button
          ref="addOwnButton"
          class="tk-button gear-add-own"
          :disabled="disabled || customOpen || editing !== undefined"
          type="button"
          @click="customOpen = true"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.8"
            viewBox="0 0 24 24"
            width="18"
          ><path d="M12 5v14M5 12h14" /></svg>
          {{ t('tripDrafts.gear.addOwn') }}
        </button>
      </div>
    </div>
    <PersonalEquipmentDialog
      v-if="customOpen"
      :categories="categories"
      :form-token="formToken"
      :full="full"
      :group-id="group?.id"
      :initial-name="query"
      :library="library"
      :selected-names="selectedNames"
      :subgroup-id="subgroup?.id"
      @close="closeCustom"
      @saved="acceptCustom"
      @session-error="emit('sessionError', $event)"
    />
    <div class="gear-browser">
      <div v-if="loading" class="gear-loading" role="status">
        <span class="tk-sr-only">{{ t('tripDrafts.gear.loading') }}</span>
        <UiSkeleton class="gear-loading-heading" />
        <div class="gear-loading-items"><UiSkeleton v-for="row in 8" :key="row" /></div>
      </div>
      <div v-else-if="loadIssue" class="gear-feedback">
        <span class="tk-field-hint" role="status">{{ t('tripDrafts.gear.loadError') }}</span>
        <button
          class="tk-button tk-button-text"
          :disabled="disabled || customOpen"
          type="button"
          @click="load"
        >{{ t('identity.retry') }}</button>
      </div>
      <div
        v-else-if="showCategories"
        :aria-label="t('tripDrafts.gear.categories')"
        class="gear-categories"
        role="group"
      >
        <section v-for="section in categoryGroups" :key="section.label">
          <h5>{{ section.label }}</h5>
          <ul class="gear-catalog">
            <li v-for="entry in section.entries" :key="entry.id">
              <button
                :data-gear-category="entry.id"
                :disabled="disabled"
                type="button"
                @click="openCategory(entry.id)"
              >
                <EquipmentIcon :category="entry.id" />
                <span>{{ entry.label }}</span>
                <span aria-hidden="true" class="gear-plus">›</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
      <template v-else>
        <div v-if="category && !query.trim()" class="gear-category-header">
          <button
            class="tk-button tk-button-text"
            data-gear-back
            type="button"
            @click="openCategory()"
          >{{ t('tripDrafts.gear.back') }}</button>
          <span>{{ categoryLabel }}</span>
        </div>
        <div v-if="group && !query.trim()" class="gear-category-header">
          <button
            class="tk-button tk-button-text"
            data-personal-back
            type="button"
            @click="parentFolder"
          >
            {{ t(subgroup ? 'tripDrafts.gear.groupBack' : 'tripDrafts.gear.folderBack') }}
          </button>
          <span>{{ subgroup ? group.label + ' / ' + subgroup.label : group.label }}</span>
        </div>
        <p v-if="!available.length && !folders.length" class="tk-field-hint" role="status">{{ t(query ? 'tripDrafts.gear.noneFound' : scope === 'personal' && !library.some(item => item.scope === 'personal') ? 'tripDrafts.gear.nonePersonal' : 'tripDrafts.gear.allSelected') }}</p>
        <ul v-else :aria-label="t('tripDrafts.gear.available')" class="gear-catalog">
          <li v-for="folder in folders" :key="folder.id">
            <button
              :data-personal-folder="folder.id"
              :disabled="disabled"
              type="button"
              @click="openFolder(folder)"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="20"
                stroke="currentColor"
                stroke-linejoin="round"
                stroke-width="1.65"
                viewBox="0 0 24 24"
                width="20"
              ><path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
              <span>{{ folder.label }}</span>
              <span aria-hidden="true" class="gear-plus">›</span>
            </button>
          </li>
          <li v-for="item in available" :key="item.id">
            <button
              :aria-describedby="query.trim() ? id + item.id : undefined"
              :aria-label="t('tripDrafts.gear.take', { name: item.label })"
              :data-gear-id="item.id"
              :disabled="disabled || full || customOpen || editing !== undefined"
              type="button"
              @click="add(item)"
            >
              <EquipmentIcon v-if="item.scope === 'system' || item.icon" :category="item.icon ?? item.category" />
              <span>{{ item.label }}<small v-if="query.trim()" :id="id + item.id" class="gear-result-category">{{ detail(item) }}</small></span>
              <span aria-hidden="true" class="gear-plus">+</span>
            </button>
          </li>
        </ul>
      </template>
    </div>
    <span aria-live="polite" class="tk-sr-only">{{ announcement }}</span>
  </section>
</template>

<style scoped>
.trip-gear { display: grid; align-content: start; gap: var(--tk-space-3); min-width: 0; }
.gear-intro { display: flex; align-items: center; justify-content: space-between; gap: var(--tk-space-3); padding: var(--tk-space-3) var(--tk-space-4); border-radius: var(--tk-radius); background: var(--tk-raised); }
.gear-intro h3, .gear-packed-title h4, .trip-gear p { margin: 0; }
.gear-intro h3 { font-size: var(--tk-text-lg); line-height: 1.2; }
.gear-intro p { margin-block-start: .35rem; color: var(--tk-muted); font-size: var(--tk-text-sm); line-height: 1.45; }
.gear-art { flex: none; inline-size: clamp(68px, 10vw, 106px); aspect-ratio: 3 / 2; border-radius: var(--tk-radius); }
.gear-art :deep(.tk-skeleton) { background-color: var(--tk-line); }
.gear-tools, .gear-custom, .gear-edit { display: grid; gap: var(--tk-space-2); }
.gear-tools { container-type: inline-size; }
.gear-toolbar, .gear-feedback, .gear-packed-title, .gear-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--tk-space-1) var(--tk-space-2); }
.gear-add-own { gap: var(--tk-space-1); padding-inline: var(--tk-space-3); color: var(--tk-accent); white-space: nowrap; }
.gear-toolbar :deep(.tk-segmented) { max-width: 100%; }
@container (max-width: 26rem) {
  .gear-toolbar :deep(.tk-segment > span), .gear-add-own { padding-inline: var(--tk-space-2); font-size: var(--tk-text-sm); }
}
@container (max-width: 18rem) {
  .gear-toolbar { display: grid; grid-template-columns: 1fr; gap: var(--tk-space-2); }
  .gear-toolbar :deep(.tk-segment) { flex: 1; }
}
.gear-actions { justify-content: flex-end; }
.gear-loading { display: grid; gap: var(--tk-space-2); padding: 2px; }
.gear-loading-heading { width: 6rem; height: 1em; }
.gear-loading-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--tk-space-2); }
.gear-loading-items > span { height: var(--tk-target); }
.gear-catalog, .gear-packed-list { display: grid; gap: var(--tk-space-2); margin: 0; padding: 2px; list-style: none; }
.gear-catalog { grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; }
.gear-catalog li { min-inline-size: 0; }
.gear-browser { position: relative; min-inline-size: 0; }
.gear-categories h5 { margin: .25rem 2px .4rem; color: var(--tk-muted); font-size: var(--tk-text-sm); font-weight: 600; }
.gear-categories section + section { margin-block-start: var(--tk-space-3); }
.gear-result-category { display: block; margin-block-start: .15rem; color: var(--tk-muted); font-weight: 400; }
.gear-catalog button { display: flex; align-items: center; gap: var(--tk-space-2); width: 100%; height: 100%; min-height: var(--tk-target); padding: .45rem .65rem; border: 1px solid var(--tk-line); border-radius: var(--tk-radius); background: var(--tk-surface); color: var(--tk-ink); font: inherit; font-size: var(--tk-text-sm); font-weight: 550; line-height: 1.3; text-align: start; cursor: pointer; overflow-wrap: anywhere; }
.gear-catalog button:disabled, .gear-packed-info button:disabled { opacity: .6; cursor: default; }
.gear-catalog button svg { flex: none; color: var(--tk-accent); }
.gear-plus { margin-inline-start: auto; color: var(--tk-accent); font-size: 1.1rem; }
.gear-catalog button:hover:not(:disabled), .gear-packed-info button:hover:not(:disabled) { background: var(--tk-raised); }
.gear-catalog button:focus-visible, .gear-packed-info button:focus-visible { outline: 2px solid var(--tk-focus); outline-offset: -2px; }
.gear-packed { display: grid; gap: var(--tk-space-2); padding-block-end: var(--tk-space-3); border-block-end: 1px solid var(--tk-line); }
.gear-category-header { display: flex; align-items: center; gap: var(--tk-space-2); font-size: var(--tk-text-sm); font-weight: 650; }
.gear-category-header button { padding-inline: 0; font-size: inherit; }
.gear-packed-title span, .trip-gear .tk-field-hint { color: var(--tk-muted); font-size: var(--tk-text-sm); }
.gear-packed-title span { font-variant-numeric: tabular-nums; }
.gear-packed-list { min-block-size: 0; max-block-size: 30dvh; overflow-y: auto; }
.gear-packed-list li { display: flex; align-items: center; justify-content: space-between; gap: var(--tk-space-2); padding: var(--tk-space-1) var(--tk-space-2) var(--tk-space-1) var(--tk-space-3); border-radius: var(--tk-radius); background: var(--tk-raised); }
.gear-packed-info { display: flex; align-items: center; flex-wrap: wrap; gap: 0 var(--tk-space-2); min-inline-size: 0; flex: 1; }
.gear-packed-info button { min-height: var(--tk-target); padding: 0; border: 0; border-radius: var(--tk-radius); background: transparent; color: var(--tk-ink); font: inherit; font-size: var(--tk-text-sm); font-weight: 650; text-align: start; overflow-wrap: anywhere; cursor: pointer; }
.gear-packed-info label { display: inline-flex; align-items: center; gap: var(--tk-space-1); min-height: var(--tk-target); margin-inline-start: auto; color: var(--tk-muted); font-size: var(--tk-text-sm); cursor: pointer; }
.gear-packed-info input { accent-color: var(--tk-accent); }
.gear-packed-list .tk-icon-button { font-size: 1.2rem; }
.gear-edit { width: 100%; padding-block: var(--tk-space-2); }
@media (min-width: 800px) {
  .trip-gear { position: relative; display: flex; flex-direction: column; min-block-size: 0; overflow-y: auto; }
  .trip-gear > :is(.gear-intro, .gear-tools) { flex: none; }
  .gear-packed { flex: 0 1 auto; max-block-size: max(32%, calc(2 * var(--tk-target))); grid-template-rows: auto minmax(0, 1fr); }
  .gear-packed:has(.gear-packed-list) { min-block-size: calc(var(--tk-target) + 2.5em); }
  .gear-packed-list { max-block-size: none; }
  .gear-browser { flex: 1 0 var(--tk-target); overflow-y: auto; overscroll-behavior-y: contain; }
}
@media (prefers-reduced-motion: no-preference) {
  .gear-item-enter-active { transition: opacity 160ms ease, transform 160ms ease; }
  .gear-item-enter-from { opacity: 0; transform: translateY(-5px); }
}
</style>
