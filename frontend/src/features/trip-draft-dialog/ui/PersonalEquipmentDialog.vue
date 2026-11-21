<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import {
  editorApi,
  EditorResponseError,
} from '@fsd/shared/api';
import type { EquipmentLibraryItem } from '@fsd/shared/api';
import {
  UiDialog,
  UiTextField,
} from '@fsd/shared/ui/kit';
import {
  equipmentFolders,
  equipmentNameKey,
  validEquipmentName,
} from '../equipment-library';
import type {
  FolderChoice,
  PersonalEquipmentInput,
} from '../equipment-library';
import EquipmentFolderField from './EquipmentFolderField.vue';
import EquipmentIcon from './EquipmentIcon.vue';

type Icon = EquipmentLibraryItem['category'];
const props = defineProps<{
  library: EquipmentLibraryItem[];
  categories: { id: Icon; label: string }[];
  selectedNames: ReadonlySet<string>;
  full: boolean;
  initialName: string;
  groupId?: string;
  subgroupId?: string;
  formToken: (signal: AbortSignal) => Promise<string>;
}>();
const emit = defineEmits<{ close: []; saved: [item: EquipmentLibraryItem]; sessionError: [error: unknown] }>();
const { t } = useI18n();
const form = useTemplateRef<HTMLFormElement>('form');
const fields = useTemplateRef<HTMLElement>('fields');
const iconsInitiallyOpen = ref(true);
const name = ref(props.initialName);
const touched = ref(false);
const group = ref<FolderChoice | undefined>(props.groupId ? { id: props.groupId } : undefined);
const subgroup = ref<FolderChoice | undefined>(props.subgroupId ? { id: props.subgroupId } : undefined);
const groupNameConfirmed = ref(false);
const icon = ref<Icon | ''>('');
const saving = ref(false);
const issue = ref('');
const request = new AbortController();
let command = { key: '', fingerprint: '' };
watch([name, group, subgroup, icon], () => {
  issue.value = '';
});

const groups = computed(() => equipmentFolders(props.library));
const currentGroupId = computed(() => group.value && 'id' in group.value ? group.value.id : undefined);
const canAddSubgroup = computed(() => !groupNameConfirmed.value && group.value && 'label' in group.value && validEquipmentName(group.value.label));
const subgroups = computed(() => currentGroupId.value ? equipmentFolders(props.library, currentGroupId.value) : []);
watch(() => currentGroupId.value ?? (group.value && 'new'), () => {
  subgroup.value = undefined;
  groupNameConfirmed.value = false;
}, { flush: 'sync' });
const icons = computed(() => [
  ...props.categories,
  { id: 'other' as const, label: t('tripDrafts.gear.iconOther') },
]);
const selectedIconName = computed(() => icons.value.find(option => option.id === icon.value)?.label ?? t('tripDrafts.gear.iconNone'));
const nameError = computed(() => {
  if (!name.value.trim()) {
    return t('tripDrafts.gear.empty');
  }
  if (!validEquipmentName(name.value)) {
    return t('tripDrafts.gear.invalid');
  }
  if (props.full && !props.selectedNames.has(equipmentNameKey(name.value))) {
    return t('tripDrafts.gear.limit');
  }
  return '';
});
const valid = computed(() => !nameError.value && [group.value, subgroup.value]
  .every(folder => !folder || 'id' in folder || validEquipmentName(folder.label)));

function trimmed(folder: FolderChoice) {
  return 'id' in folder ? folder : { label: folder.label.trim() };
}

function dismiss() {
  if (!saving.value) {
    emit('close');
  }
}

async function editFolderName(level: 'group' | 'subgroup') {
  groupNameConfirmed.value = level === 'subgroup';
  if (level === 'subgroup') {
    subgroup.value ??= { label: '' };
  }
  await nextTick();
  form.value?.querySelector<HTMLInputElement>(`[name="gear-${level}-name"]`)?.focus();
}

function showFocusedLabel(event: FocusEvent) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.classList.contains('tk-text-input')) {
    return;
  }
  const reveal = () => {
    const scroller = fields.value;
    if (!scroller || input !== document.activeElement) {
      return;
    }
    const label = input.labels?.[0];
    const inset = (label?.offsetHeight ?? 0) / 2 + 2;
    const offset = input.getBoundingClientRect().top - inset - scroller.getBoundingClientRect().top;
    if (offset < 0) {
      scroller.scrollTop += Math.floor(offset);
    }
  };
  reveal();
  requestAnimationFrame(reveal);
}

async function save() {
  if (!valid.value || saving.value) {
    return;
  }
  const body: PersonalEquipmentInput = {
    label: name.value.trim(),
    scope: 'personal',
    ...(group.value && { group: trimmed(group.value) }),
    ...(subgroup.value && { subgroup: trimmed(subgroup.value) }),
    ...(icon.value && { icon: icon.value }),
  };
  const fingerprint = JSON.stringify(body);
  if (command.fingerprint !== fingerprint) {
    command = { fingerprint, key: crypto.randomUUID() };
  }
  saving.value = true;
  issue.value = '';
  try {
    const { signal } = request;
    const csrf = await props.formToken(signal);
    const item = await editorApi.createEquipment(body, { csrf, key: command.key, signal });
    await props.formToken(signal);
    if (!signal.aborted) {
      emit('saved', item);
    }
  }
  catch (error) {
    if (!request.signal.aborted) {
      const code = error instanceof EditorResponseError ? error.code : '';
      issue.value = t(code === 'EQUIPMENT_DETAILS_CONFLICT'
        ? 'tripDrafts.gear.ownConflict'
        : code === 'NOT_FOUND' ? 'tripDrafts.gear.folderMissing' : 'tripDrafts.gear.saveError');
      emit('sessionError', error);
    }
  }
  finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await nextTick();
  if (fields.value && fields.value.scrollHeight > fields.value.clientHeight) {
    iconsInitiallyOpen.value = false;
  }
  form.value?.querySelector<HTMLInputElement>('[name="gear-custom-name"]')?.focus({ preventScroll: true });
});
onBeforeUnmount(() => request.abort());
</script>

<template>
  <Teleport to="body">
    <UiDialog
      class="personal-gear-dialog"
      layout="compact"
      :model-value="true"
      size="medium"
      :title="t('tripDrafts.gear.ownTitle')"
      @update:model-value="dismiss"
    >
      <form
        ref="form"
        class="personal-gear-form"
        novalidate
        @submit.prevent="save"
      >
        <div ref="fields" class="personal-gear-fields" @focusin="showFocusedLabel">
          <UiTextField
            v-model="name"
            class="personal-gear-text"
            :disabled="saving"
            :error="touched ? nameError : undefined"
            :label="t('tripDrafts.gear.ownName')"
            name="gear-custom-name"
            required
            @blur="touched = true"
          />
          <div class="personal-gear-folders">
            <EquipmentFolderField
              v-model="group"
              :confirmed-group="groupNameConfirmed"
              :disabled="saving"
              :folders="groups"
              level="group"
              :panel-boundary="fields"
              @edit-group="editFolderName('group')"
            />
            <button
              v-if="canAddSubgroup"
              class="tk-button tk-button-text personal-folder-action"
              :disabled="saving"
              type="button"
              @click="editFolderName('subgroup')"
            >{{ t(subgroup ? 'tripDrafts.gear.resumeSubgroup' : 'tripDrafts.gear.addSubgroup') }}</button>
            <EquipmentFolderField
              v-if="currentGroupId || groupNameConfirmed"
              v-model="subgroup"
              :disabled="saving"
              :folders="subgroups"
              level="subgroup"
              :panel-boundary="fields"
            />
          </div>
          <details class="personal-gear-icons" :open="iconsInitiallyOpen">
            <summary>
              <span>{{ t('tripDrafts.gear.icon') }}</span>
              <span class="personal-gear-icon-value">
                <EquipmentIcon v-if="icon" :category="icon" />
                {{ selectedIconName }}
              </span>
            </summary>
            <fieldset :disabled="saving">
              <legend class="tk-sr-only">{{ t('tripDrafts.gear.icon') }}</legend>
              <label :title="t('tripDrafts.gear.iconNone')">
                <input
                  v-model="icon"
                  :aria-label="t('tripDrafts.gear.iconNone')"
                  class="tk-sr-only"
                  name="gear-icon"
                  type="radio"
                  value=""
                >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="20"
                  stroke="currentColor"
                  stroke-width="1.7"
                  viewBox="0 0 24 24"
                  width="20"
                ><circle cx="12" cy="12" r="8" /><path d="m6 18 12-12" /></svg>
              </label>
              <label v-for="option in icons" :key="option.id" :title="option.label">
                <input
                  v-model="icon"
                  :aria-label="option.label"
                  class="tk-sr-only"
                  name="gear-icon"
                  type="radio"
                  :value="option.id"
                >
                <EquipmentIcon :category="option.id" />
              </label>
            </fieldset>
          </details>
          <p v-if="issue" class="tk-field-error" role="alert">{{ issue }}</p>
        </div>
        <footer>
          <button
            class="tk-button"
            :disabled="saving"
            type="button"
            @click="dismiss"
          >{{ t('identity.cancel') }}</button>
          <button class="tk-button tk-button-primary" :disabled="saving || !valid" type="submit">{{ t('tripDrafts.gear.saveAndTake') }}</button>
        </footer>
      </form>
    </UiDialog>
  </Teleport>
</template>

<style scoped>
.personal-gear-dialog.tk-dialog { --tk-dialog-size: 37.5rem; block-size: min(40.25rem, var(--tk-dialog-max-height)); overflow: clip; }
.personal-gear-dialog :deep(.tk-dialog-inner) { grid-template-rows: auto minmax(0, 1fr); height: 100%; box-sizing: border-box; }
.personal-gear-form { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-block-size: 0; min-inline-size: 0; gap: var(--tk-space-4); }
.personal-gear-fields { display: grid; align-content: start; min-block-size: 0; gap: var(--tk-space-4); margin: calc(-1 * var(--tk-space-3)) -3px -3px; padding: var(--tk-space-3) 3px 3px; scroll-padding-block: var(--tk-space-3); overflow: auto; overscroll-behavior: contain; container-type: inline-size; }
.personal-gear-fields :deep(.tk-text-input) { scroll-margin-block-start: var(--tk-space-3); }
.personal-gear-folders { display: grid; align-items: start; gap: var(--tk-space-4); }
.personal-folder-action { grid-column: 1 / -1; justify-self: start; margin-block-start: calc(-1 * var(--tk-space-2)); }
@container (min-width: 26rem) {
  .personal-gear-folders:has(> .tk-select ~ .tk-select) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-height: 32rem) {
  .personal-gear-dialog :deep(.tk-dialog-inner) { gap: var(--tk-space-2); padding-block: var(--tk-space-2); }
  .personal-gear-form { gap: var(--tk-space-2); }
  .personal-gear-fields { gap: var(--tk-space-2); margin-block-start: -3px; }
}
@media (max-height: 32rem) and (min-width: 32rem) {
  .personal-gear-fields:has(.personal-gear-folders > :only-child):has(.personal-gear-icons:not([open])) { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; }
  .personal-gear-fields > .personal-gear-text, .personal-gear-fields > [role="alert"] { grid-column: 1 / -1; }
}
.personal-gear-form footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--tk-space-2); padding-block-start: var(--tk-space-3); border-block-start: 1px solid var(--tk-line); }
.personal-gear-form p { margin: 0; }
.personal-gear-icons { min-inline-size: 0; }
.personal-gear-icons summary { display: flex; align-items: center; justify-content: space-between; gap: var(--tk-space-2); min-height: var(--tk-target); padding-inline: var(--tk-space-3); border: 1px solid var(--tk-line); border-radius: var(--tk-radius); cursor: pointer; }
.personal-gear-icons summary::-webkit-details-marker { display: none; }
.personal-gear-icons summary::after { width: .5rem; height: .5rem; flex: none; margin-inline-end: .15rem; transform: rotate(45deg); border-inline-end: 1.5px solid; border-block-end: 1.5px solid; content: ''; }
.personal-gear-icons[open] summary::after { transform: rotate(225deg); }
.personal-gear-icon-value { display: inline-flex; align-items: center; gap: var(--tk-space-1); margin-inline-start: auto; color: var(--tk-muted); font-size: var(--tk-text-sm); }
.personal-gear-icons fieldset { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--tk-target), 1fr)); gap: var(--tk-space-1); min-inline-size: 0; margin: var(--tk-space-2) 0 0; padding: 0; border: 0; }
.personal-gear-icons label { position: relative; display: grid; place-items: center; min-height: var(--tk-target); border: 1px solid var(--tk-line); border-radius: var(--tk-radius); color: var(--tk-accent); cursor: pointer; }
.personal-gear-icons label:has(:checked) { border-color: var(--tk-accent); background: var(--tk-selected); }
.personal-gear-icons label:has(:focus-visible) { outline: 2px solid var(--tk-focus); outline-offset: 1px; }
</style>
