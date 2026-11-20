<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import MaterialSymbol from '../material-symbol/MaterialSymbol.vue'

type Option = {
  value: string
  label: string
  icon?: InstanceType<typeof MaterialSymbol>['$props']['name']
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  label: string
  options: readonly Option[]
  placeholder?: string
  multiple?: boolean
  iconSummary?: boolean
  searchable?: boolean
  disabled?: boolean
  pending?: boolean
  error?: string
}>(), { placeholder: 'Выбрать', error: undefined })

const model = defineModel<readonly string[]>({ default: () => [] })
const id = useId()
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const search = ref<HTMLInputElement>()
const open = ref(false)
const query = ref('')
let navigatingRadios = false
let internalPointer = false
const selected = computed(() => props.options.filter(option => model.value.includes(option.value)))
const visible = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('ru')
  return props.options.filter(option => option.label.toLocaleLowerCase('ru').includes(needle))
})
const summary = computed(() => selected.value.map(option => option.label).join(', ') || props.placeholder)
const showIcons = computed(() => props.iconSummary && !props.pending && selected.value.length > 0 && selected.value.every(option => option.icon))

function close(returnFocus = false) {
  if (!open.value) return
  open.value = false
  query.value = ''
  navigatingRadios = false
  if (returnFocus) trigger.value?.focus()
}

async function toggle() {
  if (open.value) {
    close(true)
    return
  }
  open.value = true
  await nextTick()
  const option = panel.value?.querySelector<HTMLInputElement>('.tk-select-option input:checked:not(:disabled)')
    ?? panel.value?.querySelector<HTMLInputElement>('.tk-select-option input:not(:disabled)')
  const target = search.value ?? option ?? panel.value
  target?.focus()
}

function change(value: string, checked: boolean) {
  if (props.multiple) {
    model.value = checked ? [...model.value, value] : model.value.filter(item => item !== value)
    return
  }
  model.value = [value]
}

function choose(event: KeyboardEvent, value: string) {
  if (props.multiple) {
    if (props.iconSummary && event.key === 'Enter') {
      event.preventDefault()
      change(value, !model.value.includes(value))
    }
    return
  }
  event.preventDefault()
  change(value, true)
  close(true)
}

function selectOption(event: MouseEvent, option: Option) {
  if (props.multiple || option.disabled || navigatingRadios) return
  event.preventDefault()
  change(option.value, true)
  close(true)
}

function searchEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  const available = visible.value.filter(option => !option.disabled)
  const only = available.length === 1 ? available[0] : undefined
  if (only && !props.multiple) {
    change(only.value, true)
    close(true)
    return
  }
  panel.value?.querySelector<HTMLInputElement>('.tk-select-option input:not(:disabled)')?.focus()
}

function clear() {
  model.value = []
  const target = search.value ?? panel.value
  target?.focus()
}

function onPointer(event: PointerEvent) {
  internalPointer = event.target instanceof Node && Boolean(root.value?.contains(event.target))
  if (!internalPointer) close()
}

function onFocusOut(event: FocusEvent) {
  if (!internalPointer && event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) close()
}

function onEscape(event: KeyboardEvent) {
  if (!open.value) return
  event.preventDefault()
  event.stopPropagation()
  close(true)
}

onMounted(() => document.addEventListener('pointerdown', onPointer))
onUnmounted(() => document.removeEventListener('pointerdown', onPointer))
watch(() => props.disabled || props.pending, blocked => { if (blocked) close() })
</script>

<template>
  <div
    ref="root" class="tk-field tk-select" :class="{ 'tk-select-icon-summary': iconSummary }"
    @focusout="onFocusOut" @keydown.esc="onEscape" @keydown.capture="internalPointer = false"
    @click.capture="internalPointer = false" @pointercancel="internalPointer = false"
  >
    <span :id="`${id}-label`" class="tk-label">{{ label }}</span>
    <div class="tk-select-anchor">
      <button
        ref="trigger" type="button" class="tk-select-trigger"
        :aria-labelledby="iconSummary ? undefined : `${id}-label ${id}-value`" :aria-label="iconSummary ? label + ' — ' + summary : undefined"
        :aria-expanded="open" :aria-controls="id"
        :aria-invalid="error ? 'true' : undefined" :aria-describedby="error ? `${id}-error` : undefined"
        :disabled="disabled || pending" :aria-busy="pending" @click="toggle"
      >
        <span v-if="showIcons" class="tk-select-icons" aria-hidden="true">
          <span v-for="option in selected" :key="option.value" :title="option.label"><MaterialSymbol v-if="option.icon" :name="option.icon" /></span>
        </span>
        <template v-else>
          <MaterialSymbol v-if="selected.length === 1 && selected[0]?.icon" :name="selected[0].icon" />
          <span :id="`${id}-value`" class="tk-select-value">{{ pending ? 'Загружаем…' : summary }}</span>
        </template>
        <span v-if="multiple && selected.length && !iconSummary" class="tk-select-count" aria-hidden="true">{{ selected.length }}</span>
        <i v-if="pending" class="tk-spinner" aria-hidden="true" />
        <i v-else class="tk-chevron" aria-hidden="true" />
      </button>
      <div v-show="open && !disabled && !pending" :id="id" ref="panel" class="tk-select-panel" tabindex="-1">
        <input v-if="searchable" ref="search" v-model="query" type="search" class="tk-input" placeholder="Найти вариант" :aria-label="`Поиск · ${label}`" @keydown.enter="searchEnter">
        <fieldset
          class="tk-select-options" :data-multiple="multiple" @pointerdown="navigatingRadios = false"
          @keydown="navigatingRadios = $event.key.startsWith('Arrow')" @keyup="navigatingRadios = false"
        >
          <legend class="tk-sr-only">{{ label }}</legend>
          <p v-if="!visible.length" class="tk-muted" role="status">Ничего не найдено</p>
          <label v-for="option in visible" :key="option.value" class="tk-select-option" @click="selectOption($event, option)">
            <input
              :class="{ 'tk-sr-only': !multiple }"
              :type="multiple ? 'checkbox' : 'radio'" :name="id"
              :checked="model.includes(option.value)" :disabled="option.disabled"
              @change="change(option.value, ($event.target as HTMLInputElement).checked)"
              @keydown.enter="choose($event, option.value)" @keydown.space="choose($event, option.value)"
            >
            <MaterialSymbol v-if="option.icon" :name="option.icon" />
            <span class="tk-select-option-label">{{ option.label }}</span>
            <i v-if="!multiple && model.includes(option.value)" class="tk-checkmark" aria-hidden="true" />
          </label>
        </fieldset>
        <button v-if="multiple" class="tk-button tk-button-text" type="button" :disabled="!model.length" @click="clear">Сбросить</button>
      </div>
    </div>
    <p v-if="error" :id="`${id}-error`" class="tk-field-error">{{ error }}</p>
  </div>
</template>
