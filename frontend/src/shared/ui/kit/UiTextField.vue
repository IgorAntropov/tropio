<script setup lang="ts">
import {
  computed,
  useId,
} from 'vue';

const id = useId();
const model = defineModel<string>({ required: true });
const props = defineProps<{
  label: string;
  name?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  type?: 'text' | 'email' | 'password';
  autocomplete?: string;
  maxlength?: number;
  rows?: number;
}>();

defineSlots<{
  trailing?(props: { inputId: string; disabled: boolean }): unknown;
}>();

const emit = defineEmits<{ blur: [event: FocusEvent] }>();

const control = computed(() => ({
  id,
  'name': props.name,
  'placeholder': props.placeholder || ' ',
  'autocomplete': props.autocomplete,
  'maxlength': props.maxlength,
  'required': props.required,
  'disabled': props.disabled,
  'aria-invalid': props.error ? true : undefined,
  'aria-describedby': props.error ? `${id}-error` : props.hint ? `${id}-hint` : undefined,
}));

function syncValue(event: Event) {
  const input = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
  if (model.value !== input.value) {
    model.value = input.value;
  }
}

function onAutofill(event: AnimationEvent) {
  if (event.animationName === 'tk-text-autofill') {
    syncValue(event);
  }
}

function onBlur(event: FocusEvent) {
  syncValue(event);
  emit('blur', event);
}
</script>

<template>
  <div class="tk-field">
    <div class="tk-text-control" :class="{ 'tk-text-control-with-action': $slots.trailing }">
      <textarea
        v-if="rows"
        v-model="model"
        v-bind="control"
        class="tk-input tk-text-input tk-textarea"
        :rows="rows"
        @blur="onBlur"
        @change="syncValue"
      />
      <input
        v-else
        v-model="model"
        v-bind="control"
        class="tk-input tk-text-input"
        :type="type"
        @animationstart="onAutofill"
        @blur="onBlur"
        @change="syncValue"
      >
      <label class="tk-label tk-text-label" :for="id">
        {{ label }} <span v-if="required" aria-hidden="true" class="tk-required">*</span>
      </label>
      <div v-if="$slots.trailing" class="tk-text-trailing">
        <slot :disabled="Boolean(disabled)" :input-id="id" name="trailing" />
      </div>
    </div>
    <p
      v-if="error"
      :id="`${id}-error`"
      class="tk-field-error"
      role="alert"
    >{{ error }}</p>
    <p v-else-if="hint" :id="`${id}-hint`" class="tk-field-hint">{{ hint }}</p>
  </div>
</template>
