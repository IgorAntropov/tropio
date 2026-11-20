<script setup lang="ts">
import {
  computed,
  ref,
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
  EditorPoiChange,
  EditorPoiInput,
} from '../types';
import EditorIssue from './EditorIssue.vue';
import {
  coordinateLabel,
  useEditorCopy,
} from './presentation';

const props = defineProps<{ data: EditorPoiInput; disabled?: boolean; issue?: string | null; signInRequired?: boolean }>();
const emit = defineEmits<{ save: [change: EditorPoiChange]; close: [] }>();
const { t } = useEditorCopy();
const name = ref('');
const description = ref('');
const category = ref<readonly string[]>([]);
const options = computed(() => props.data.categories.map(item => ({ value: item.category_id, label: item.label })));
const selectedCategory = computed(() => options.value.find(option => option.value === category.value[0])?.value);
const { valid, errors, touch } = useFormValidation({
  name: () => {
    const value = name.value.trim();
    if (!value) {
      return t('poiNameError');
    }
    if (hasInvalidText(value)) {
      return t('invalidText');
    }
    if ([...value].length > 120) {
      return t('nameTooLong');
    }
  },
  category: () => !selectedCategory.value ? t('poiCategoryError') : undefined,
  description: () => {
    if (hasInvalidText(description.value)) {
      return t('invalidText');
    }
    if ([...description.value.trim()].length > 4000) {
      return t('descriptionTooLong');
    }
  },
});

function touchCategory(event: FocusEvent) {
  const { currentTarget, relatedTarget } = event;
  if (currentTarget instanceof HTMLElement && (!(relatedTarget instanceof Node) || !currentTarget.contains(relatedTarget))) {
    touch('category');
  }
}

function submit() {
  if (props.disabled || !valid.value || !selectedCategory.value) {
    return;
  }
  emit('save', { name: name.value.trim(), description: description.value.trim(), category_id: selectedCategory.value });
}
</script>

<template>
  <UiDialog
    class="editor-dialog"
    :model-value="true"
    :subtitle="coordinateLabel(data.position)"
    :title="t('createPoi')"
    @update:model-value="!$event && emit('close')"
  >
    <form class="editor-form" novalidate @submit.prevent="submit">
      <EditorIssue
        v-if="issue"
        compact
        :issue="issue"
        :sign-in-required="signInRequired"
      />
      <UiTextField
        v-model="name"
        :disabled="disabled"
        :error="errors.name"
        :label="t('rename')"
        :maxlength="240"
        required
        @blur="touch('name')"
      />
      <UiSelect
        v-model="category"
        :disabled="disabled || !options.length"
        :error="errors.category"
        :label="t('poiCategory')"
        :options="options"
        :placeholder="t('poiCategoryPlaceholder')"
        @focusout="touchCategory"
      />
      <UiTextField
        v-model="description"
        :disabled="disabled"
        :error="errors.description"
        :label="t('description')"
        :maxlength="8000"
        :rows="3"
        @blur="touch('description')"
      />
      <p class="editor-support">{{ t('poiScope') }}</p>
      <div class="editor-form-footer">
        <button class="tk-button" type="button" @click="emit('close')">{{ t('cancel') }}</button>
        <button class="tk-button tk-button-primary" :disabled="disabled || !valid" type="submit">{{ t('save') }}</button>
      </div>
    </form>
  </UiDialog>
</template>
