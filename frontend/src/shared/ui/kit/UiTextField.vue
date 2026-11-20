<script setup lang="ts">
import { useId } from 'vue'

const id = useId()
const model = defineModel<string>({ required: true })
defineProps<{
  label: string
  name?: string
  placeholder?: string
  hint?: string
  error?: string
  required?: boolean
  disabled?: boolean
  type?: 'text' | 'email' | 'password'
  autocomplete?: string
  maxlength?: number
}>()
</script>

<template>
  <div class="tk-field">
    <label class="tk-label" :for="id">{{ label }} <span v-if="required" class="tk-required" aria-hidden="true">*</span></label>
    <input
      :id="id" v-model="model" class="tk-input" :name="name" :placeholder="placeholder"
      :type="type" :autocomplete="autocomplete" :maxlength="maxlength"
      :required="required" :disabled="disabled" :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? `${id}-error` : hint ? `${id}-hint` : undefined"
    >
    <p v-if="error" :id="`${id}-error`" class="tk-field-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="`${id}-hint`" class="tk-field-hint">{{ hint }}</p>
  </div>
</template>
