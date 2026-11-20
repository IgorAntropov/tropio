<script setup lang="ts">
import { computed, ref } from 'vue'
import { UiAvatar, UiButton, UiDialog, UiSegmented, UiSelect, UiStatus, UiTextField } from '@kit'

const themes = [{ value: 'light', label: 'Светлая' }, { value: 'dark', label: 'Тёмная' }]
const views = [{ value: 'map', label: 'Карта' }, { value: 'list', label: 'Список' }]
const builtBy = [{ value: 'follow', label: 'По дорогам и тропам' }, { value: 'straight', label: 'Прямой отрезок' }]
const transports = [
  { value: 'walk', label: 'Пешком', icon: 'directions_walk' },
  { value: 'bike', label: 'Велосипед', icon: 'pedal_bike' },
  { value: 'car', label: 'Авто', icon: 'directions_car' },
] as const
const tripTypes = [
  { value: 'walk', label: 'Пеший', icon: 'directions_walk' },
  { value: 'bike', label: 'Велосипедный', icon: 'pedal_bike' },
  { value: 'car', label: 'Автомобильный', icon: 'directions_car' },
  { value: 'mixed', label: 'Комбинированный', icon: 'alt_route' },
] as const
const trips = [
  { name: 'Тропы над Томью', date: '14–16 августа', type: 'walk', distance: '16,5 км' },
  { name: 'Вдоль соснового бора', date: '22 августа', type: 'bike', distance: '28 км' },
  { name: 'От реки до озера', date: '29–30 августа', type: 'mixed', distance: '43 км' },
]
const people = [
  { name: 'Ирина Волкова', src: '/avatar_04.png', presence: 'online', description: 'В сети' },
  { name: 'Максим Ким', src: '/avatar_09.png', presence: 'offline', description: 'Не в сети' },
  { name: 'Анна Левина', src: '/avatar_01.png', description: 'Без статуса' },
] as const
const colors = [
  { token: 'accent', label: 'Акцент' },
  { token: 'ink', label: 'Текст' },
  { token: 'surface', label: 'Поверхность' },
  { token: 'success', label: 'Успех' },
  { token: 'warning', label: 'Внимание' },
  { token: 'danger', label: 'Ошибка' },
]
const spacings = [4, 8, 12, 16, 24, 32]
const buttonSizes = [
  { value: 'small', label: 'Маленькая' },
  { value: 'medium', label: 'Средняя' },
  { value: 'large', label: 'Большая' },
] as const
const formButtonSize = ref<(typeof buttonSizes)[number]['value']>('medium')
const sections = [
  { id: 'controls', label: 'Управление' },
  { id: 'feedback', label: 'Состояния' },
  { id: 'tokens', label: 'Токены' },
]

const theme = ref('light')
const view = ref('map')
const transport = ref<readonly string[]>(['walk'])
const filters = ref<readonly string[]>([])
const building = ref<readonly string[]>(['follow'])
const trackName = ref('')
const tripName = ref('')
const submitted = ref(false)
const dialogOpen = ref(false)
const formMode = ref<'track' | 'trip'>('track')
const formSaved = ref(false)
const tripResults = computed(() => filters.value.length ? trips.filter(trip => filters.value.includes(trip.type)) : trips)
const fieldError = computed(() => submitted.value && formMode.value === 'trip' && !tripName.value.trim() ? 'Укажи название путешествия.' : undefined)

function saveExample() {
  submitted.value = true
  if (fieldError.value) return
  formSaved.value = true
  dialogOpen.value = false
}

function openForm(mode: 'track' | 'trip') {
  formMode.value = mode
  submitted.value = false
  formSaved.value = false
  dialogOpen.value = true
}
</script>

<template>
  <div class="showcase" :data-theme="theme">
    <a href="#main" class="skip-link">К содержанию</a>
    <header class="mast">
      <a href="#" class="wordmark">
        <img src="/logo.png" alt="" width="36" height="36">
        Тропио
      </a>
      <UiSegmented v-model="theme" class="theme-switch" label="Тема" :options="themes" />
    </header>

    <div class="showcase-layout">
      <nav class="section-nav" aria-label="Разделы UI-kit">
        <a v-for="section in sections" :key="section.id" :href="`#${section.id}`">{{ section.label }}</a>
      </nav>

      <main id="main" class="showcase-main">
        <h1>UI-kit Тропио</h1>
        <section id="controls" class="showcase-section" aria-labelledby="controls-heading">
          <h2 id="controls-heading">Управление</h2>
          <div class="showcase-grid showcase-grid-map">
            <article class="sample map-sample">
              <h3>Карта и список</h3>
              <div class="map-stage" :data-view="view">
                <div class="map-switch"><UiSegmented v-model="view" label="Вид каталога" :options="views" :glass="view === 'map'" /></div>
                <div v-if="view === 'map'" class="map-credits">
                  <a href="https://openmaptiles.org/">© OpenMapTiles</a>
                  <span aria-hidden="true">·</span>
                  <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>
                </div>
                <ul v-else class="trip-results">
                  <li v-for="trip in tripResults" :key="trip.name">
                    <span><strong>{{ trip.name }}</strong><small>{{ trip.date }}</small></span>
                    <span class="tk-muted">{{ trip.distance }}</span>
                  </li>
                  <li v-if="!tripResults.length" class="tk-muted">По выбранным типам путешествий пока нет.</li>
                </ul>
              </div>
            </article>

            <article class="sample">
              <h3>Выпадающие списки</h3>
              <div class="example-stack">
                <UiSelect v-model="transport" label="Транспорт отрезка" :options="transports" />
                <UiSelect v-model="building" label="Способ построения" :options="builtBy" />
                <UiSelect v-model="filters" label="Тип путешествия" placeholder="Все типы" :options="tripTypes" multiple searchable />
                <p class="example-meta tk-muted" aria-live="polite">В выдаче {{ tripResults.length }} из {{ trips.length }}</p>
              </div>
            </article>
          </div>
        </section>

        <section id="feedback" class="showcase-section" aria-labelledby="feedback-heading">
          <h2 id="feedback-heading">Состояния</h2>
          <div class="showcase-grid">
            <article class="sample">
              <h3>Сохранение маршрута</h3>
              <ul class="status-list">
                <li><UiStatus tone="pending">Сохраняем…</UiStatus></li>
                <li><UiStatus tone="success">Сохранено</UiStatus></li>
                <li><UiStatus tone="warning">Нет сети · не сохранено</UiStatus></li>
                <li><UiStatus tone="danger">Конфликт версий</UiStatus></li>
              </ul>
            </article>
            <article class="sample">
              <h3>Аватар и присутствие</h3>
              <ul class="people-list">
                <li v-for="person in people" :key="person.name">
                  <UiAvatar :name="person.name" :src="person.src" :presence="'presence' in person ? person.presence : undefined" />
                  <div><strong>{{ person.name }}</strong><small>{{ person.description }}</small></div>
                </li>
              </ul>
            </article>
            <article class="sample">
              <h3>Форма редактирования</h3>
              <p class="tk-muted form-description">Модальное окно на широком экране. Отдельный экран на смартфоне.</p>
              <fieldset class="button-size-field">
                <legend>Размер кнопок формы</legend>
                <div class="button-size-options">
                  <UiButton
                    v-for="size in buttonSizes" :key="size.value" :size="size.value"
                    :aria-pressed="formButtonSize === size.value" @click="formButtonSize = size.value">
                    {{ size.label }}
                  </UiButton>
                </div>
              </fieldset>
              <div class="form-examples">
                <button type="button" class="tk-button tk-button-primary" @click="openForm('track')">Редактировать трек</button>
                <button type="button" class="tk-button" @click="openForm('trip')">Новое путешествие</button>
              </div>
              <p v-if="formSaved" class="save-confirmation"><UiStatus tone="success">Пример сохранён</UiStatus></p>
            </article>
          </div>
        </section>

        <section id="tokens" class="showcase-section" aria-labelledby="tokens-heading">
          <h2 id="tokens-heading">Токены</h2>
          <div class="showcase-grid">
            <article class="sample sample-colors">
              <h3>Палитра</h3>
              <ul class="color-list">
                <li v-for="color in colors" :key="color.token">
                  <span class="swatch" :style="{ background: `var(--tk-${color.token})` }" />
                  <strong>{{ color.label }}</strong>
                  <code>--tk-{{ color.token }}</code>
                </li>
              </ul>
            </article>
            <article class="sample">
              <h3>Типографика</h3>
              <ul class="type-list">
                <li><strong>Inter Variable</strong><code>400–700</code></li>
                <li><span>Основной текст</span><code>.9375rem</code></li>
                <li><small>Подпись к полю</small><code>.8125rem</code></li>
              </ul>
            </article>
            <article class="sample">
              <h3>Отступы</h3>
              <ul class="spacing-list">
                <li v-for="space in spacings" :key="space"><span :style="{ width: `${space * 2}px` }" /><code>{{ space }} px</code></li>
              </ul>
            </article>
          </div>
        </section>
      </main>
    </div>

    <UiDialog v-model="dialogOpen" :title="formMode === 'track' ? 'Редактирование трека' : 'Новое путешествие'" :subtitle="formMode === 'track' ? 'Лесная тропа → Поворот к озеру' : undefined">
      <form novalidate class="example-stack" @submit.prevent="saveExample">
        <template v-if="formMode === 'track'">
          <UiTextField v-model="trackName" name="trackName" label="Название трека" placeholder="Например, Сосновый спуск" />
          <UiSelect v-model="building" label="Способ построения" :options="builtBy" />
        </template>
        <UiTextField v-else v-model="tripName" name="tripName" label="Название путешествия" placeholder="Например, Новый год у реки" :error="fieldError" required />
        <div class="dialog-actions">
          <UiButton :size="formButtonSize" @click="dialogOpen = false">Отмена</UiButton>
          <UiButton type="submit" :size="formButtonSize" class="tk-button-primary">Сохранить пример</UiButton>
        </div>
      </form>
    </UiDialog>
  </div>
</template>

<style>
body { margin: 0; }
.showcase {
  min-height: 100vh;
  background: var(--tk-canvas);
  color: var(--tk-ink);
  font-size: var(--tk-text-base);
  line-height: 1.5;
}
.showcase :is(h1, h2, h3, ul, p) { margin-block: 0; }
.showcase li { list-style: none; }
.showcase ul { padding: 0; }
.showcase a { color: inherit; }
.showcase a:focus-visible { outline: 2px solid var(--tk-focus); outline-offset: 3px; }
.mast {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 12px max(20px, calc((100% - 1240px) / 2));
  border-bottom: 1px solid var(--tk-line);
  background: var(--tk-surface);
}
.wordmark { display: flex; gap: 8px; align-items: center; font-size: 1.05rem; font-weight: 700; text-decoration: none; }
.theme-switch { font-size: var(--tk-text-sm); }
.theme-switch .tk-segment > span { padding-inline: var(--tk-space-3); }
.skip-link:not(:focus) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.showcase-layout {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 164px minmax(0, 1fr);
  gap: var(--tk-space-6);
  max-width: 1280px;
  margin-inline: auto;
  padding: var(--tk-space-6) 20px 56px;
}
.section-nav { position: sticky; top: var(--tk-space-5); height: fit-content; display: grid; gap: 3px; }
.section-nav a { box-sizing: border-box; display: flex; align-items: center; min-height: 44px; padding-inline: var(--tk-space-3); border-radius: 10px; color: var(--tk-muted); font-weight: 600; text-decoration: none; }
.section-nav a:hover { color: var(--tk-ink); background: var(--tk-raised); }
.showcase h1 { font-size: clamp(2rem, 4.2vw, 3.4rem); letter-spacing: -.06em; line-height: 1.1; }
.showcase h2 { margin-bottom: var(--tk-space-4); font-size: clamp(1.28rem, 2vw, 1.6rem); letter-spacing: -.03em; }
.showcase h3 { font-size: 1rem; line-height: 1.35; }
.showcase-section { margin-top: 36px; scroll-margin-top: 20px; }
.showcase-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: stretch; gap: var(--tk-space-4); }
.showcase-grid-map { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
.sample { min-width: 0; padding: var(--tk-space-4); border: 1px solid var(--tk-line); border-radius: var(--tk-radius-panel); background: var(--tk-surface); }
.sample h3 { margin-bottom: var(--tk-space-4); }
.map-sample { display: flex; flex-direction: column; }
.map-stage { position: relative; flex: 1; min-height: 260px; border: 1px solid var(--tk-line); border-radius: var(--tk-radius); background: var(--tk-canvas); }
.map-stage[data-view="map"] { background: #daeadc url('/basemap.jpg') center 53% / cover; }
[data-theme="dark"] .map-stage[data-view="map"] { background-image: linear-gradient(rgb(8 27 23 / 40%), rgb(8 27 23 / 40%)), url('/basemap.jpg'); }
.map-switch { display: flex; justify-content: center; padding: var(--tk-space-3); }
.map-credits { position: absolute; right: 0; bottom: 0; display: flex; gap: 4px; padding: 3px 6px; border-radius: 6px 0 11px 0; background: var(--tk-surface); font-size: .65rem; }
.showcase .trip-results { margin: 0 var(--tk-space-3) var(--tk-space-3); }
.trip-results li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--tk-space-2); padding: var(--tk-space-2); border-bottom: 1px solid var(--tk-line); }
.trip-results small, .people-list small { display: block; color: var(--tk-muted); }
.example-stack, .status-list, .people-list { display: grid; gap: var(--tk-space-3); }
.example-meta { font-size: var(--tk-text-sm); }
.people-list li { display: flex; align-items: center; gap: var(--tk-space-3); }
.people-list .tk-avatar { flex: none; }
.dialog-actions { display: flex; justify-content: flex-end; gap: var(--tk-space-2); flex-wrap: wrap; margin-top: var(--tk-space-3); }
.form-examples { display: flex; flex-wrap: wrap; gap: var(--tk-space-2); }
.button-size-field { margin: 0 0 var(--tk-space-4); padding: 0; border: 0; min-width: 0; }
.button-size-field legend { padding: 0; font-weight: 600; font-size: var(--tk-text-sm); }
.button-size-options { display: flex; align-items: center; flex-wrap: wrap; gap: var(--tk-space-3); padding-block: var(--tk-space-2); }
.button-size-options [aria-pressed=true] { border-color: var(--tk-accent); background: var(--tk-selected); }
.showcase .form-description { margin-bottom: var(--tk-space-4); }
.showcase .save-confirmation { margin-top: var(--tk-space-3); }
.sample-colors { grid-column: 1 / -1; }
.color-list { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--tk-space-3); }
.color-list li { display: grid; gap: var(--tk-space-1); }
.showcase code { color: var(--tk-muted); font-size: .75rem; overflow-wrap: anywhere; }
.swatch { min-height: 44px; border: 1px solid var(--tk-line); border-radius: 8px; }
.type-list, .spacing-list { display: grid; gap: var(--tk-space-2); }
.type-list li, .spacing-list li { display: flex; justify-content: space-between; align-items: center; gap: var(--tk-space-2); }
.type-list strong { font-size: var(--tk-text-lg); }
.type-list small { font-size: var(--tk-text-sm); }
.spacing-list li > span { height: 8px; border-radius: 3px; background: var(--tk-accent); }

@media (max-width: 1050px) {
  .showcase-layout { grid-template-columns: 124px minmax(0, 1fr); gap: var(--tk-space-4); }
  .showcase-grid:not(.showcase-grid-map) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 860px) {
  .showcase-layout { display: block; }
  .section-nav { position: static; display: flex; flex-wrap: wrap; margin: -12px 0 16px; }
}
@media (max-width: 639px) {
  .mast, .showcase-layout { padding-inline: var(--tk-space-3); }
  .showcase-layout { padding-top: var(--tk-space-5); }
  .showcase-grid, .showcase-grid:not(.showcase-grid-map) { grid-template-columns: minmax(0, 1fr); }
  .showcase-section { margin-top: 24px; }
  .map-stage { min-height: 216px; }
  .color-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dialog-actions > button { flex: 1 1 auto; }
}
</style>
