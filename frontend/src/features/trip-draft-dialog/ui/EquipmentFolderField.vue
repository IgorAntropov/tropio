<script setup lang="ts">
import {
  computed,
  ref,
} from 'vue';
import {
  UiSelect,
  UiTextField,
} from '@fsd/shared/ui/kit';
import { validEquipmentName } from '../equipment-library';
import type {
  EquipmentFolder,
  FolderChoice,
} from '../equipment-library';

const props = defineProps<{ folders: EquipmentFolder[]; level: 'group' | 'subgroup'; panelBoundary: HTMLElement | null; disabled: boolean; confirmedGroup?: boolean }>();
const emit = defineEmits<{ editGroup: [] }>();
const choice = defineModel<FolderChoice>();
const { t } = useI18n();
const touched = ref(false);
const confirmedName = computed(() => props.confirmedGroup && choice.value && 'label' in choice.value ? choice.value.label.trim() : '');
const choices = computed(() => [
  { value: 'none', label: t('tripDrafts.gear.' + props.level + 'None') },
  { value: 'new', label: t(confirmedName.value ? 'tripDrafts.gear.groupEdit' : 'tripDrafts.gear.' + props.level + 'New') },
  ...(confirmedName.value ? [{ value: 'draft', label: confirmedName.value }] : []),
  ...props.folders.map(folder => ({ value: folder.id, label: folder.label })),
]);
const selected = computed<readonly string[]>({
  get: () => [!choice.value ? 'none' : 'id' in choice.value ? choice.value.id : confirmedName.value ? 'draft' : 'new'],
  set: ([value]) => {
    touched.value = false;
    if (value === 'draft') {
      return;
    }
    if (value === 'new' && choice.value && 'label' in choice.value) {
      if (confirmedName.value) {
        emit('editGroup');
      }
      return;
    }
    choice.value = !value || value === 'none' ? undefined : value === 'new' ? { label: '' } : { id: value };
  },
});
const name = computed({
  get: () => choice.value && 'label' in choice.value ? choice.value.label : '',
  set: (label: string) => {
    choice.value = { label };
  },
});
const nameError = computed(() => validEquipmentName(name.value) ? undefined : t('tripDrafts.gear.folderInvalid'));
</script>

<template>
  <UiSelect
    v-model="selected"
    :disabled="disabled"
    :label="t('tripDrafts.gear.' + level)"
    label-hidden
    :options="choices"
    :panel-boundary="panelBoundary"
  />
  <UiTextField
    v-if="selected[0] === 'new'"
    v-model="name"
    class="personal-folder-name"
    :disabled="disabled"
    :error="touched ? nameError : undefined"
    :label="t('tripDrafts.gear.' + level + 'Name')"
    :name="'gear-' + level + '-name'"
    required
    @blur="touched = true"
  />
</template>

<style scoped>
.personal-folder-name { grid-column: 1 / -1; }
</style>
