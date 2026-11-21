<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  useId,
  watch,
} from 'vue';
import MaterialSymbol from '../material-symbol/MaterialSymbol.vue';
import UiSearchField from './UiSearchField.vue';

type Option = {
  value: string;
  label: string;
  icon?: InstanceType<typeof MaterialSymbol>['$props']['name'];
  disabled?: boolean;
};

const props = withDefaults(defineProps<{
  label: string;
  labelHidden?: boolean;
  options: readonly Option[];
  placeholder?: string;
  multiple?: boolean;
  iconSummary?: boolean;
  searchable?: boolean;
  disabled?: boolean;
  pending?: boolean;
  error?: string;
  panelBoundary?: HTMLElement | null;
}>(), { placeholder: 'Выбрать', error: undefined, panelBoundary: undefined });

const model = defineModel<readonly string[]>({ default: () => [] });
const id = useId();
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const search = ref<InstanceType<typeof UiSearchField>>();
const open = ref(false);
const opensAbove = ref(false);
const availableHeight = ref<number>();
const query = ref('');
let navigatingRadios = false;
let internalPointer = false;
const selected = computed(() => props.options.filter(option => model.value.includes(option.value)));
const visible = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('ru');
  return props.options.filter(option => option.label.toLocaleLowerCase('ru').includes(needle));
});
const summary = computed(() => selected.value.map(option => option.label).join(', ') || props.placeholder);
const showIcons = computed(() => props.iconSummary && !props.pending && selected.value.length > 0 && selected.value.every(option => option.icon));

function close(returnFocus = false) {
  if (!open.value) {
    return;
  }
  open.value = false;
  query.value = '';
  navigatingRadios = false;
  if (returnFocus) {
    trigger.value?.focus({ preventScroll: !!props.panelBoundary });
  }
}

async function toggle() {
  if (open.value) {
    close(true);
    return;
  }
  open.value = true;
  await nextTick();
  const option = panel.value?.querySelector<HTMLInputElement>('.tk-select-option input:checked:not(:disabled)')
    ?? panel.value?.querySelector<HTMLInputElement>('.tk-select-option input:not(:disabled)');
  const target = search.value ?? option ?? panel.value;
  if (props.panelBoundary && target instanceof HTMLElement) {
    target.focus({ preventScroll: true });
    const label = option?.closest('label');
    if (label && panel.value) {
      const offset = label.getBoundingClientRect().top - panel.value.getBoundingClientRect().top;
      if (offset < 0 || offset + label.offsetHeight > panel.value.clientHeight) {
        panel.value.scrollTop += offset;
      }
    }
  }
  else {
    target?.focus();
  }
}

watch([open, () => props.panelBoundary], ([active, boundary], _previous, onCleanup) => {
  const button = trigger.value;
  const popup = panel.value;
  if (!active || !boundary || !button || !popup) {
    opensAbove.value = false;
    availableHeight.value = undefined;
    return;
  }
  const viewport = window.visualViewport;
  const place = () => {
    const bounds = boundary.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) {
      close();
      return;
    }
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (viewport?.height ?? document.documentElement.clientHeight);
    const gap = parseFloat(getComputedStyle(popup).paddingBlockStart);
    const below = Math.min(bounds.bottom, viewportBottom) - rect.bottom - gap;
    const above = rect.top - Math.max(bounds.top, viewportTop) - gap;
    const naturalHeight = popup.scrollHeight + popup.offsetHeight - popup.clientHeight;
    opensAbove.value = below < naturalHeight && above > below;
    availableHeight.value = Math.max(0, Math.floor(opensAbove.value ? above : below));
  };
  place();
  const resize = new ResizeObserver(place);
  resize.observe(boundary);
  resize.observe(button);
  resize.observe(popup);
  const content = new MutationObserver(place);
  content.observe(boundary, { childList: true, subtree: true, characterData: true });
  const events = new AbortController();
  const options = { capture: true, signal: events.signal };
  window.addEventListener('scroll', place, options);
  viewport?.addEventListener('scroll', place, options);
  viewport?.addEventListener('resize', place, options);
  onCleanup(() => {
    events.abort();
    content.disconnect();
    resize.disconnect();
  });
}, { flush: 'post' });

function change(value: string, checked: boolean) {
  if (props.multiple) {
    model.value = checked ? [...model.value, value] : model.value.filter(item => item !== value);
    return;
  }
  model.value = [value];
}

function choose(event: KeyboardEvent, value: string) {
  if (props.multiple) {
    if (props.iconSummary && event.key === 'Enter') {
      event.preventDefault();
      change(value, !model.value.includes(value));
    }
    return;
  }
  event.preventDefault();
  change(value, true);
  close(true);
}

function selectOption(event: MouseEvent, option: Option) {
  if (props.multiple || option.disabled || navigatingRadios) {
    return;
  }
  event.preventDefault();
  change(option.value, true);
  close(true);
}

function searchEnter() {
  const available = visible.value.filter(option => !option.disabled);
  const only = available.length === 1 ? available[0] : undefined;
  if (only && !props.multiple) {
    change(only.value, true);
    close(true);
    return;
  }
  panel.value?.querySelector<HTMLInputElement>('.tk-select-option input:not(:disabled)')?.focus();
}

function clear() {
  model.value = [];
  const target = search.value ?? panel.value;
  target?.focus();
}

function onPointer(event: PointerEvent) {
  internalPointer = event.target instanceof Node && Boolean(root.value?.contains(event.target));
  if (!internalPointer) {
    close();
  }
}

function onFocusOut(event: FocusEvent) {
  if (!internalPointer && event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) {
    close();
  }
}

function onEscape(event: KeyboardEvent) {
  if (!open.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  close(true);
}

onMounted(() => document.addEventListener('pointerdown', onPointer));
onUnmounted(() => document.removeEventListener('pointerdown', onPointer));
watch(() => props.disabled || props.pending, (blocked) => {
  if (blocked) {
    close();
  }
});
</script>

<template>
  <div
    ref="root"
    class="tk-field tk-select"
    :class="{ 'tk-select-icon-summary': iconSummary }"
    @click.capture="internalPointer = false"
    @focusout="onFocusOut"
    @keydown.capture="internalPointer = false"
    @keydown.esc="onEscape"
    @pointercancel="internalPointer = false"
  >
    <span :id="`${id}-label`" :class="labelHidden ? 'tk-sr-only' : 'tk-label'">{{ label }}</span>
    <div class="tk-select-anchor">
      <button
        ref="trigger"
        :aria-busy="pending"
        :aria-controls="id"
        :aria-describedby="error ? `${id}-error` : undefined"
        :aria-expanded="open"
        :aria-invalid="error ? 'true' : undefined"
        :aria-label="iconSummary ? label + ' — ' + summary : undefined"
        :aria-labelledby="iconSummary ? undefined : `${id}-label ${id}-value`"
        class="tk-select-trigger"
        :disabled="disabled || pending"
        type="button"
        @click="toggle"
        @mousedown.left="panelBoundary && $event.preventDefault()"
      >
        <span v-if="showIcons" aria-hidden="true" class="tk-select-icons">
          <span v-for="option in selected" :key="option.value" :title="option.label"><MaterialSymbol v-if="option.icon" :name="option.icon" /></span>
        </span>
        <template v-else>
          <MaterialSymbol v-if="selected.length === 1 && selected[0]?.icon" :name="selected[0].icon" />
          <span :id="`${id}-value`" class="tk-select-value">{{ pending ? 'Загружаем…' : summary }}</span>
        </template>
        <span v-if="multiple && selected.length && !iconSummary" aria-hidden="true" class="tk-select-count">{{ selected.length }}</span>
        <i v-if="pending" aria-hidden="true" class="tk-spinner" />
        <i v-else aria-hidden="true" class="tk-chevron" />
      </button>
      <div
        v-show="open && !disabled && !pending"
        :id="id"
        ref="panel"
        class="tk-select-panel"
        :data-placement="availableHeight === undefined ? undefined : opensAbove ? 'above' : 'below'"
        :style="availableHeight === undefined ? undefined : { '--tk-select-available': `${availableHeight}px` }"
        tabindex="-1"
      >
        <UiSearchField
          v-if="searchable"
          ref="search"
          v-model="query"
          :label="`Поиск · ${label}`"
          @confirm="searchEnter"
        />
        <fieldset
          class="tk-select-options"
          :data-multiple="multiple"
          @keydown="navigatingRadios = $event.key.startsWith('Arrow')"
          @keyup="navigatingRadios = false"
          @pointerdown="navigatingRadios = false"
        >
          <legend class="tk-sr-only">{{ label }}</legend>
          <p v-if="!visible.length" class="tk-muted" role="status">Ничего не найдено</p>
          <label
            v-for="option in visible"
            :key="option.value"
            class="tk-select-option"
            @click="selectOption($event, option)"
          >
            <input
              :checked="model.includes(option.value)"
              :class="{ 'tk-sr-only': !multiple }"
              :disabled="option.disabled"
              :name="id"
              :type="multiple ? 'checkbox' : 'radio'"
              @change="change(option.value, ($event.target as HTMLInputElement).checked)"
              @keydown.enter="choose($event, option.value)"
              @keydown.space="choose($event, option.value)"
            >
            <MaterialSymbol v-if="option.icon" :name="option.icon" />
            <span class="tk-select-option-label">{{ option.label }}</span>
            <i v-if="!multiple && model.includes(option.value)" aria-hidden="true" class="tk-checkmark" />
          </label>
        </fieldset>
        <button
          v-if="multiple"
          class="tk-button tk-button-text"
          :disabled="!model.length"
          type="button"
          @click="clear"
        >Сбросить</button>
      </div>
    </div>
    <p v-if="error" :id="`${id}-error`" class="tk-field-error">{{ error }}</p>
  </div>
</template>
