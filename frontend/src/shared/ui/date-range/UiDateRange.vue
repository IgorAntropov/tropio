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
import { formatCalendarPeriod } from '@fsd/shared/i18n/format-calendar-period';
import UiSelect from '../kit/UiSelect.vue';
import {
  calendarDate,
  dateKey,
  localToday,
  mondayIndex,
  monthWeeks,
  readDate,
  shiftMonth,
} from './calendar';

const props = defineProps<{
  label: string;
  placeholder?: string;
  startOnlyLabel?: string;
  disabled?: boolean;
  error?: string;
  hint?: string;
}>();
const emit = defineEmits<{ blur: [] }>();
const start = defineModel<string>('start', { required: true });
const end = defineModel<string>('end', { required: true });
const { t, locale } = useI18n();
const id = useId();
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const grid = ref<HTMLTableElement>();
const open = ref(false);
const today = ref('');
const cursor = ref(calendarDate(2000, 0, 1));
const anchor = ref('');
let initialStart = '';
let initialEnd = '';

const fullDate = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'full', timeZone: 'UTC' }));
const month = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'long', timeZone: 'UTC' }));
const weekdays = computed(() => {
  const weekday = new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, index) => weekday.format(calendarDate(2024, 0, 1 + index)));
});
const summary = computed(() => {
  const first = readDate(start.value);
  const last = readDate(end.value);
  if (first && last && first <= last) {
    return formatCalendarPeriod(t, first, last);
  }
  if (first) {
    return t('dateRange.from', { date: formatCalendarPeriod(t, first) });
  }
  if (last) {
    return t('dateRange.through', { date: formatCalendarPeriod(t, last) });
  }
  return props.placeholder ?? t('dateRange.any');
});
const weeks = computed(() => monthWeeks(cursor.value).map(week => week.map((date) => {
  if (!date) {
    return null;
  }
  const value = dateKey(date);
  const first = value === (start.value || end.value);
  const last = value === (end.value || start.value);
  const middle = !!start.value && value > start.value && value < end.value;
  return {
    date,
    value,
    first,
    last,
    middle,
    selected: first || last || middle,
  };
})));
const year = computed(() => cursor.value.getUTCFullYear());
const years = computed(() => {
  const first = Math.max(1, year.value - 10);
  return Array.from({ length: Math.min(year.value + 10, 9999) - first + 1 }, (_, i) => {
    const value = String(first + i);
    return { value, label: value };
  });
});
const selectedYear = computed({
  get: () => [String(year.value)] as readonly string[],
  set: (values) => {
    if (values[0]) {
      cursor.value = shiftMonth(cursor.value, (Number(values[0]) - year.value) * 12);
    }
  },
});

function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) {
    trigger.value?.focus({ preventScroll: true });
  }
}

watch(panel, (popup, _previous, onCleanup) => {
  const button = trigger.value;
  if (!popup || !button) {
    return;
  }
  popup.showPopover?.();
  const gap = 8;
  const viewport = window.visualViewport;
  const place = () => {
    const rect = button.getBoundingClientRect();
    const top = viewport?.offsetTop ?? 0;
    const left = viewport?.offsetLeft ?? 0;
    const width = viewport?.width ?? document.documentElement.clientWidth;
    const height = viewport?.height ?? document.documentElement.clientHeight;
    const panelWidth = Math.min(rect.width, width - 2 * gap);
    popup.style.width = `${panelWidth}px`;
    popup.style.left = `${Math.max(left + gap, Math.min(rect.left, left + width - gap - panelWidth))}px`;
    const below = top + height - rect.bottom - 2 * gap;
    const above = rect.top - top - 2 * gap;
    const opensAbove = below < popup.scrollHeight + 2 && above > below;
    popup.style.top = `${opensAbove ? rect.top - gap : rect.bottom + gap}px`;
    popup.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`;
    popup.toggleAttribute('data-above', opensAbove);
  };
  place();
  const resize = new ResizeObserver(place);
  resize.observe(button);
  resize.observe(popup);
  if (button.form) {
    resize.observe(button.form);
  }
  const visibility = new IntersectionObserver(([entry]) => {
    if (entry && !entry.isIntersecting) {
      close();
    }
  });
  visibility.observe(button);
  const events = new AbortController();
  const options = { capture: true, signal: events.signal };
  window.addEventListener('scroll', place, options);
  window.addEventListener('resize', place, options);
  viewport?.addEventListener('resize', place, options);
  viewport?.addEventListener('scroll', place, options);
  onCleanup(() => {
    events.abort();
    resize.disconnect();
    visibility.disconnect();
  });
}, { flush: 'post' });

async function focusDay() {
  await nextTick();
  grid.value?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
}

async function toggle() {
  if (open.value) {
    return close();
  }
  initialStart = start.value;
  initialEnd = end.value;
  const current = localToday();
  const first = readDate(initialStart);
  const last = readDate(initialEnd);
  today.value = dateKey(current);
  cursor.value = first ?? last ?? current;
  anchor.value = first && !last ? initialStart : last && !first ? initialEnd : '';
  open.value = true;
  await focusDay();
}

function choose(day: Date) {
  cursor.value = day;
  const selected = dateKey(day);
  if (anchor.value) {
    start.value = selected < anchor.value ? selected : anchor.value;
    end.value = selected < anchor.value ? anchor.value : selected;
    close(true);
    return;
  }
  anchor.value = selected;
  start.value = selected;
  end.value = props.startOnlyLabel ? '' : selected;
}

function clear() {
  start.value = '';
  end.value = '';
  close(true);
}

function escape(event: KeyboardEvent) {
  if (!open.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  start.value = initialStart;
  end.value = initialEnd;
  close(true);
}

function moveMonth(offset: number) {
  const next = shiftMonth(cursor.value, offset);
  if (next.getUTCFullYear() >= 1 && next.getUTCFullYear() <= 9999) {
    cursor.value = next;
  }
}

function navigate(event: KeyboardEvent) {
  const date = cursor.value;
  const offsets: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
    Home: -mondayIndex(date),
    End: 6 - mondayIndex(date),
  };
  if (Object.hasOwn(offsets, event.key)) {
    const next = calendarDate(year.value, date.getUTCMonth(), date.getUTCDate() + offsets[event.key]!);
    if (next.getUTCFullYear() >= 1 && next.getUTCFullYear() <= 9999) {
      cursor.value = next;
    }
  }
  else if (event.key === 'PageUp' || event.key === 'PageDown') {
    moveMonth((event.shiftKey ? 12 : 1) * (event.key === 'PageUp' ? -1 : 1));
  }
  else {
    return;
  }
  event.preventDefault();
  void focusDay();
}

function outside(target: EventTarget | null) {
  if (open.value && target instanceof Node && !root.value?.contains(target)) {
    close();
  }
}
function blur(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) {
    emit('blur');
  }
}
function tab() {
  requestAnimationFrame(() => outside(document.activeElement));
}
function pointer(event: PointerEvent) {
  outside(event.target);
}
onMounted(() => document.addEventListener('pointerdown', pointer));
onUnmounted(() => document.removeEventListener('pointerdown', pointer));
</script>

<template>
  <div
    ref="root"
    class="tk-field date-range"
    @focusout="blur"
    @keydown.esc="escape"
    @keydown.tab="tab"
  >
    <span :id="id + '-label'" class="tk-label">{{ label }}</span>
    <button
      ref="trigger"
      :aria-controls="open ? id : undefined"
      :aria-describedby="error || hint ? id + '-message' : undefined"
      :aria-expanded="open"
      :aria-invalid="error ? true : undefined"
      :aria-labelledby="id + '-label ' + id + '-value'"
      class="tk-select-trigger"
      :disabled="disabled"
      type="button"
      @click="toggle"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="20"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.7"
        viewBox="0 0 24 24"
        width="20"
      >
        <rect
          height="16"
          rx="2.5"
          width="17"
          x="3.5"
          y="5"
        /><path d="M7.5 3v4m9-4v4m-13 3.5h17" />
      </svg>
      <span :id="id + '-value'" class="date-range-value">{{ summary }}</span><i aria-hidden="true" class="tk-chevron" />
    </button>
    <div
      v-if="open && !disabled"
      :id="id"
      ref="panel"
      :aria-labelledby="id + '-label'"
      class="date-range-panel"
      popover="manual"
      role="group"
    >
      <div class="date-range-nav">
        <button
          :aria-label="t('dateRange.previousMonth')"
          class="tk-button tk-icon-button"
          :disabled="year === 1 && cursor.getUTCMonth() === 0"
          type="button"
          @click="moveMonth(-1)"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14 6-6 6 6 6" /></svg>
        </button>
        <div class="date-range-month"><span>{{ month.format(cursor) }}</span><UiSelect v-model="selectedYear" :label="t('dateRange.year')" :options="years" /></div>
        <button
          :aria-label="t('dateRange.nextMonth')"
          class="tk-button tk-icon-button"
          :disabled="year === 9999 && cursor.getUTCMonth() === 11"
          type="button"
          @click="moveMonth(1)"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m10 6 6 6-6 6" /></svg>
        </button>
      </div>
      <p class="date-range-instruction" role="status">{{ t(anchor ? 'dateRange.chooseEnd' : 'dateRange.chooseStart') }}</p>
      <table
        ref="grid"
        :aria-label="month.format(cursor) + ' ' + year"
        aria-multiselectable="true"
        class="date-range-grid"
        role="grid"
        @keydown="navigate"
      >
        <thead><tr><th v-for="weekday in weekdays" :key="weekday" scope="col">{{ weekday }}</th></tr></thead>
        <tbody>
          <tr v-for="(week, index) in weeks" :key="index">
            <td v-for="(day, weekday) in week" :key="weekday" :aria-selected="day?.selected">
              <button
                v-if="day"
                :aria-current="day.value === today ? 'date' : undefined"
                :aria-label="fullDate.format(day.date)"
                class="date-range-day"
                :class="{ 'date-range-first': day.first, 'date-range-last': day.last, 'date-range-middle': day.middle }"
                :tabindex="day.value === dateKey(cursor) ? 0 : -1"
                type="button"
                @click="choose(day.date)"
              >{{ day.date.getUTCDate() }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="date-range-footer"><button
        class="tk-button tk-button-text"
        :disabled="!start && !end"
        type="button"
        @click="clear"
      >{{ t('dateRange.clear') }}</button><button
        v-if="startOnlyLabel && start && !end"
        class="tk-button"
        type="button"
        @click="close(true)"
      >{{ startOnlyLabel }}</button></div>
    </div>
    <p
      v-if="error"
      :id="id + '-message'"
      class="tk-field-error"
      role="alert"
    >{{ error }}</p>
    <p v-else-if="hint" :id="id + '-message'" class="tk-field-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.date-range-value { flex: 1; min-width: 0; }
.date-range > button > svg { flex: none; color: var(--tk-accent); }
.date-range-panel {
  position: fixed;
  inset: auto;
  z-index: 5;
  box-sizing: border-box;
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--tk-space-2);
  border: 1px solid var(--tk-line);
  border-radius: var(--tk-radius);
  background: var(--tk-surface);
  color: var(--tk-ink);
  box-shadow: var(--tk-shadow);
}
.date-range-panel[data-above] { transform: translateY(-100%); }
.date-range-nav, .date-range-month { display: flex; align-items: center; }
.date-range-nav { justify-content: space-between; }
.date-range-nav .tk-icon-button { border-color: transparent; color: var(--tk-accent); }
.date-range-nav svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.date-range-month { gap: var(--tk-space-2); font-weight: 650; }
.date-range-month > span::first-letter { text-transform: uppercase; }
.date-range-month :deep(.tk-label) { position: absolute; clip-path: inset(50%); width: 1px; height: 1px; overflow: hidden; }
.date-range-month :deep(.tk-select-trigger) { gap: 6px; padding-inline: var(--tk-space-2); border-color: transparent; background: var(--tk-raised); color: var(--tk-accent); }
.date-range-month :deep(.tk-select-panel) { inset-inline: auto 0; min-width: 100px; max-height: 230px; }
.date-range-instruction { margin: var(--tk-space-2) 0; color: var(--tk-muted); font-size: var(--tk-text-sm); text-align: center; }
.date-range-grid { width: 100%; table-layout: fixed; border-collapse: collapse; text-align: center; }
.date-range-grid th { height: 30px; font-size: var(--tk-text-sm); font-weight: 500; color: var(--tk-muted); }
.date-range-grid th::first-letter { text-transform: uppercase; }
.date-range-grid td { padding: 1px 0; }
.date-range-day {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  min-height: var(--tk-target);
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.date-range-middle { border-radius: 0; background: var(--tk-selected); }
.date-range-first, .date-range-last { font-weight: 650; background: var(--tk-accent); color: var(--tk-on-accent); }
.date-range-first:not(.date-range-last) { border-start-end-radius: 0; border-end-end-radius: 0; }
.date-range-last:not(.date-range-first) { border-start-start-radius: 0; border-end-start-radius: 0; }
.date-range-day[aria-current="date"]::after { content: ''; position: absolute; bottom: 4px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
@media (hover: hover) {
  .date-range-day:hover { box-shadow: inset 0 0 0 1px var(--tk-accent); }
}
.date-range-day:focus-visible { outline: 2px solid var(--tk-focus); outline-offset: -3px; }
.date-range-day:is(.date-range-first, .date-range-last):focus-visible { outline-color: var(--tk-on-accent); }
.date-range-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--tk-space-2); margin-top: var(--tk-space-2); padding-top: var(--tk-space-1); border-top: 1px solid var(--tk-line); }
</style>
