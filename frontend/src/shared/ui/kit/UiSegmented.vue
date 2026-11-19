<script setup lang="ts">
import { useId } from 'vue'

const id = useId()
defineProps<{
  label: string
  options: readonly { value: string, label: string }[]
  glass?: boolean
}>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <fieldset class="tk-segmented" :class="{ 'tk-segmented-glass': glass }">
    <legend class="tk-sr-only">{{ label }}</legend>
    <label v-for="option in options" :key="option.value" class="tk-segment">
      <input v-model="model" class="tk-sr-only" type="radio" :name="id" :value="option.value">
      <span>{{ option.label }}</span>
    </label>
  </fieldset>
</template>
