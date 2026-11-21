<script setup lang="ts">
import {
  useId,
  useTemplateRef,
} from 'vue';

const props = defineProps<{
  label: string;
  submitLabel?: string;
  name?: string;
  maxlength?: number;
  disabled?: boolean;
}>();
const model = defineModel<string>({ required: true });
const emit = defineEmits<{ confirm: [] }>();
const id = useId();
const input = useTemplateRef<HTMLInputElement>('input');

function onEnter(event: KeyboardEvent) {
  if (!event.isComposing && !props.submitLabel) {
    event.preventDefault();
    emit('confirm');
  }
}

defineExpose({ focus: (options?: FocusOptions) => input.value?.focus(options) });
</script>

<template>
  <div class="tk-text-control tk-search-field">
    <input
      :id="id"
      ref="input"
      v-model="model"
      autocomplete="off"
      class="tk-input tk-text-input"
      :disabled="disabled"
      :maxlength="maxlength"
      :name="name"
      placeholder=" "
      type="search"
      @keydown.enter="onEnter"
    >
    <label class="tk-label tk-text-label" :for="id">{{ label }}</label>
    <component
      :is="submitLabel ? 'button' : 'span'"
      :aria-hidden="submitLabel ? undefined : true"
      :aria-label="submitLabel"
      class="tk-search-icon"
      :class="{ 'tk-button tk-icon-button': submitLabel }"
      :disabled="submitLabel ? disabled : undefined"
      :title="submitLabel"
      :type="submitLabel ? 'submit' : undefined"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="19"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.7"
        viewBox="0 0 24 24"
        width="19"
      ><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
    </component>
  </div>
</template>

<style scoped>
.tk-search-field { --tk-text-start: var(--tk-target); --tk-text-color: var(--tk-line); }
.tk-search-field .tk-text-input { min-block-size: var(--tk-target); padding-block: calc(9px - var(--tk-text-border)); }
.tk-search-icon { display: grid; position: absolute; inset-inline-start: 0; inset-block-start: 50%; place-items: center; inline-size: var(--tk-target); transform: translateY(-50%); color: var(--tk-muted); pointer-events: none; }
button.tk-search-icon { border-color: transparent; background: transparent; color: var(--tk-accent); pointer-events: auto; }
button.tk-search-icon:hover:not(:disabled) { background: var(--tk-raised); }
button.tk-search-icon:focus-visible { outline-offset: -3px; }
</style>
