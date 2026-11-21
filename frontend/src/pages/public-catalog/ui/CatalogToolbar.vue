<script setup lang="ts">
import { tripTypeIcons } from '@fsd/entities/public-trip';
import { UiDateRange } from '@fsd/shared/ui/date-range';
import {
  UiDialog,
  UiSearchField,
  UiSelect,
} from '@fsd/shared/ui/kit';
import type { catalogFilters } from '../model/catalog';
import { useCatalogDictionaries } from '../model/use-catalog-dictionaries';
import { useCatalogLocation } from '../model/use-catalog-location';

const props = defineProps<{ filters: ReturnType<typeof catalogFilters>; catalogActive: boolean }>();
const near = defineModel<string>('near');
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const query = ref(props.filters.q ?? '');
const filterOpen = ref(false);
const filterMounted = ref(false);
const filterButton = ref<HTMLButtonElement>();
const { regions, difficulties, pending: dictionariesPending, error: dictionariesError, load: loadDictionaries, refresh: refreshDictionaries } = useCatalogDictionaries();
const { located, locating, issue: locationIssue, locate, cancel: cancelLocation } = useCatalogLocation(
  near,
  () => props.catalogActive && !route.query.bbox && !route.query.region && route.query.area !== 'all' && !filterOpen.value,
);
const nearby = ref(false);
const radius = ref<readonly string[]>([]);
const radiusOptions = ['', '5', '25', '100'].map(value => ({ value, label: value ? t('catalog.radiusKm', { value }) : t('catalog.noRadius') }));
const start = ref('');
const end = ref('');
const difficulty = ref<readonly string[]>([]);
const region = ref<readonly string[]>([]);
const datesInvalid = computed(() => !!(start.value && end.value && start.value > end.value));
const selectedTypes = ref<readonly string[]>([]);
const typeOptions = Object.entries(tripTypeIcons).map(([value, icon]) => ({ value, icon, label: t('catalog.types.' + value) }));
const legacyBounds = 'bbox';
const regionOptions = computed(() => [
  { value: '', label: t('catalog.allRegions') },
  ...(props.filters.bbox ? [{ value: legacyBounds, label: t('catalog.linkBounds') }] : []),
  ...regions.value,
]);
const difficultyOptions = computed(() => [{ value: '', label: t('catalog.allLevels') }, ...difficulties.value]);
const selectedDifficulty = computed({
  get() {
    const value = difficulty.value[0] ?? '';
    const option = difficultyOptions.value.find(item => item.value === value || item.label.toLocaleLowerCase('ru') === value.toLocaleLowerCase('ru'));
    return [option?.value ?? value];
  },
  set(value: readonly string[]) {
    difficulty.value = value;
  },
});
const filtersActive = computed(() => Boolean(near.value || Object.keys(props.filters).some(key => key !== 'q')));

async function setFilters(patch: Record<string, string>) {
  const next = Object.fromEntries(Object.entries({ ...route.query, ...patch }).filter(([, value]) => value !== ''));
  await router.replace({ path: '/catalog', query: next });
}
function openFilters() {
  loadDictionaries();
  cancelLocation();
  selectedTypes.value = (props.filters.trip_type ?? '').split(',').filter(value => Object.hasOwn(tripTypeIcons, value));
  start.value = props.filters.start_date ?? '';
  end.value = props.filters.end_date ?? '';
  difficulty.value = [props.filters.difficulty ?? ''];
  region.value = [props.filters.region ?? (props.filters.bbox ? legacyBounds : '')];
  nearby.value = !!near.value;
  radius.value = [typeof route.query.radius_km === 'string' ? route.query.radius_km : ''];
  locationIssue.value = false;
  filterMounted.value = true;
  filterOpen.value = true;
}
async function chooseNearby() {
  if (nearby.value) {
    nearby.value = false;
    return;
  }
  if (await locate() && filterOpen.value) {
    nearby.value = true;
    region.value = [];
  }
}
function chooseRegion(value: readonly string[]) {
  cancelLocation();
  locationIssue.value = false;
  nearby.value = false;
  region.value = value;
}
async function applyFilters() {
  if (datesInvalid.value || locating.value) {
    return;
  }
  near.value = nearby.value ? located.value : undefined;
  await setFilters({
    trip_type: selectedTypes.value.join(','),
    start_date: start.value,
    end_date: end.value,
    difficulty: selectedDifficulty.value[0] ?? '',
    bbox: !nearby.value && region.value[0] === legacyBounds ? props.filters.bbox ?? '' : '',
    region: !nearby.value && region.value[0] !== legacyBounds ? region.value[0] ?? '' : '',
    area: nearby.value ? 'near' : region.value[0] ? '' : 'all',
    radius_km: nearby.value ? radius.value[0] ?? '' : '',
  });
  filterOpen.value = false;
}
function resetDraft() {
  cancelLocation();
  selectedTypes.value = [];
  start.value = '';
  end.value = '';
  difficulty.value = [];
  nearby.value = false;
  radius.value = [];
  region.value = [''];
  locationIssue.value = false;
}
function filtersClosed() {
  if (filterOpen.value) {
    return;
  }
  cancelLocation();
  filterMounted.value = false;
  filterButton.value?.focus({ preventScroll: true });
}
function resetInput() {
  cancelLocation();
  filterOpen.value = false;
  query.value = '';
}
watch(() => props.filters.q, (value) => {
  query.value = value ?? '';
});
watch(() => [route.query.area, route.query.bbox, route.query.region], ([area, bbox, region]) => {
  if (area === 'all' || bbox || region) {
    near.value = undefined;
  }
});
watch(located, (position) => {
  if (!position) {
    nearby.value = false;
  }
});

defineExpose({ resetInput });
</script>

<template>
  <div class="catalog-tools">
    <form class="catalog-search" role="search" @submit.prevent="setFilters({ q: query.trim() })">
      <UiSearchField
        v-model="query"
        :label="t('catalog.search')"
        :maxlength="120"
        name="q"
        :submit-label="t('catalog.find')"
      />
    </form>
    <button
      ref="filterButton"
      :aria-expanded="filterOpen"
      aria-haspopup="dialog"
      :aria-label="t('catalog.filters')"
      class="tk-button catalog-filters"
      :class="{ 'catalog-filters-active': filtersActive }"
      :title="t('catalog.filters')"
      type="button"
      @click="openFilters"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" /></svg>
    </button>
  </div>
  <UiDialog
    v-model="filterOpen"
    class="catalog-drawer"
    slide
    :title="t('catalog.filters')"
    @click.self="filterOpen = false"
    @closed="filtersClosed"
  >
    <form
      v-if="filterMounted"
      class="catalog-filter-form"
      novalidate
      @submit.prevent="applyFilters"
    >
      <div class="catalog-filter-body">
        <UiSelect
          v-model="selectedTypes"
          icon-summary
          :label="t('catalog.type')"
          multiple
          :options="typeOptions"
          :placeholder="t('catalog.allTypes')"
        />
        <div class="catalog-area">
          <UiSelect
            :disabled="!!dictionariesError"
            :label="t('catalog.region')"
            :model-value="nearby ? [] : region"
            :options="regionOptions"
            :pending="dictionariesPending"
            :placeholder="t(nearby ? 'catalog.nearby' : 'catalog.allRegions')"
            searchable
            @update:model-value="chooseRegion"
          />
          <button
            :aria-busy="locating"
            :aria-label="t('catalog.nearby')"
            :aria-pressed="nearby"
            class="tk-button tk-icon-button catalog-nearby"
            :disabled="locating"
            :title="t(locating ? 'catalog.locating' : 'catalog.nearby')"
            type="button"
            @click="chooseNearby"
          >
            <i v-if="locating" aria-hidden="true" class="tk-spinner" />
            <svg v-else aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v2.5M22 12h-2.5M12 22v-2.5M2 12h2.5" /></svg>
          </button>
        </div>
        <p v-if="locationIssue" class="tk-field-error" role="status">{{ t('catalog.denied') }}</p>
        <UiSelect
          v-if="nearby"
          v-model="radius"
          :label="t('catalog.radius')"
          :options="radiusOptions"
          :placeholder="t('catalog.noRadius')"
        />
        <UiDateRange v-model:end="end" v-model:start="start" :label="t('catalog.period')" />
        <p v-if="datesInvalid" class="tk-field-error" role="alert">{{ t('catalog.invalidDates') }}</p>
        <UiSelect
          v-model="selectedDifficulty"
          :disabled="!!dictionariesError"
          :label="t('catalog.difficulty')"
          :options="difficultyOptions"
          :pending="dictionariesPending"
          :placeholder="difficulty[0] || t('catalog.allLevels')"
        />
        <div v-if="dictionariesError" class="catalog-dictionaries-issue">
          <p class="tk-field-error" role="status">{{ t('catalog.dictionariesUnavailable') }}</p>
          <button class="tk-button" type="button" @click="refreshDictionaries()">{{ t('catalog.retry') }}</button>
        </div>
      </div>
      <footer class="catalog-filter-actions">
        <button class="tk-button tk-button-text" type="button" @click="resetDraft">{{ t('catalog.resetDraft') }}</button>
        <button class="tk-button tk-button-primary" :disabled="datesInvalid || locating" type="submit">{{ t('catalog.apply') }}</button>
      </footer>
    </form>
  </UiDialog>
</template>
