<script setup lang="ts">
import { computed, ref } from 'vue'
import { hasInvalidText, useFormValidation } from '@fsd/shared/ui/form'
import { UiDialog, UiSelect, UiTextField } from '@fsd/shared/ui/kit'
import type { EditorPoiChange, EditorPoiInput } from '../types'
import EditorIssue from './EditorIssue.vue'
import { coordinateLabel, useEditorCopy } from './presentation'

const props = defineProps<{ data: EditorPoiInput, disabled?: boolean, issue?: string | null, signInRequired?: boolean }>()
const emit = defineEmits<{ save: [change: EditorPoiChange], close: [] }>()
const { t } = useEditorCopy()
const name = ref('')
const description = ref('')
const category = ref<readonly string[]>([])
const options = computed(() => props.data.categories.map(item => ({ value: item.category_id, label: item.label })))
const selectedCategory = computed(() => options.value.find(option => option.value === category.value[0])?.value)
const { valid, errors, touch } = useFormValidation({
  name: () => {
    const value = name.value.trim()
    if (!value) return t('poiNameError')
    if (hasInvalidText(value)) return t('invalidText')
    if ([...value].length > 120) return t('nameTooLong')
  },
  category: () => !selectedCategory.value ? t('poiCategoryError') : undefined,
  description: () => {
    if (hasInvalidText(description.value)) return t('invalidText')
    if ([...description.value.trim()].length > 4000) return t('descriptionTooLong')
  },
})

function touchCategory(event: FocusEvent) {
  const { currentTarget, relatedTarget } = event
  if (currentTarget instanceof HTMLElement && (!(relatedTarget instanceof Node) || !currentTarget.contains(relatedTarget))) {
    touch('category')
  }
}

function submit() {
  if (props.disabled || !valid.value || !selectedCategory.value) return
  emit('save', { name: name.value.trim(), description: description.value.trim(), category_id: selectedCategory.value })
}
</script>

<template>
  <UiDialog
    :model-value="true" class="editor-dialog"
    :title="t('createPoi')" :subtitle="coordinateLabel(data.position)"
    @update:model-value="!$event && emit('close')"
  >
    <form class="editor-form" novalidate @submit.prevent="submit">
      <EditorIssue v-if="issue" :issue="issue" :sign-in-required="signInRequired" compact />
      <UiTextField
        v-model="name" :label="t('rename')" :maxlength="240"
        :error="errors.name" :disabled="disabled" required @blur="touch('name')"
      />
      <UiSelect
        v-model="category" :label="t('poiCategory')" :options="options" :placeholder="t('poiCategoryPlaceholder')"
        :error="errors.category" :disabled="disabled || !options.length" @focusout="touchCategory"
      />
      <UiTextField
        v-model="description" :label="t('description')" :rows="3" :maxlength="8000" :error="errors.description"
        :disabled="disabled" @blur="touch('description')"
      />
      <p class="editor-support">{{ t('poiScope') }}</p>
      <div class="editor-form-footer">
        <button class="tk-button" type="button" @click="emit('close')">{{ t('cancel') }}</button>
        <button class="tk-button tk-button-primary" type="submit" :disabled="disabled || !valid">{{ t('save') }}</button>
      </div>
    </form>
  </UiDialog>
</template>
