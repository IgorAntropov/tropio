<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { RouteEditor } from '@fsd/widgets/route-editor'
import { RouteMap } from '@fsd/shared/map'
import type { MapFocus, MapSelection } from '@fsd/shared/map'
import { editorApi, identityApi } from '@fsd/shared/api'
import type { DraftDay, Poi, PoiCategories, Position, TravelDraft } from '@fsd/shared/api'
import { describeEditorError, editorProblemCode, useRouteEditor } from '@fsd/features/edit-route'
import type { EditSelection } from '@fsd/features/edit-route'
import { UiDialog } from '@fsd/shared/ui/kit'
import '@fsd/shared/ui/kit/kit.css'

const props = defineProps<{ tripId: string; dayId: string }>()
const config = useRuntimeConfig()
const route = useRoute()
const { t } = useI18n()
const loaded = shallowRef<TravelDraft | null>(null)
const day = shallowRef<DraftDay | null>(null)
const csrf = ref('')
const loading = ref(true)
const loadIssue = ref('')
const signIn = ref(false)
const request = new AbortController()
const key = ref('')
const markerFocus = shallowRef<MapFocus | null>(null)
const pois = shallowRef<Poi[]>([])
const activePoi = shallowRef<Poi | null>(null)
const pendingPoi = shallowRef<{ position: Position; categories: PoiCategories['items'] } | null>(null)
const poiIssue = ref('')
const poiBusy = ref(false)
const ready = ref(false)
const confirmingClear = ref(false)
const center: Position = { lon: 84.9565, lat: 56.4805 }
let poiCommand: { token: string; key: string } | null = null
let focusRequest = 0
let poiRequest: AbortController | null = null

async function renewCsrf() {
  const profile = await identityApi.me(request.signal)
  csrf.value = profile.csrf_token
  return profile.csrf_token
}

const editor = useRouteEditor(() => day.value?.route_id ?? '', () => csrf.value, renewCsrf)
const {
  draft, mode, selection, editing, status, issue, busy, changed, readOnly, buildMode, transportMode,
  canEdit, canUndo, canRedo, localVersion, reviewingLocal, signInRequired, preview, conflict,
} = editor
const canClear = computed(() => canEdit.value && !poiBusy.value && draft.value.points.length > 0)

const dayLabel = computed(() => day.value ? `День ${day.value.position}` : 'Маршрут дня')
const tripPath = computed(() => `/trips/${props.tripId}`)
const fromMap = computed(() => route.query.from === 'map')
const backTo = computed(() => fromMap.value ? '/map' : tripPath.value)
const otherDays = computed(() => (loaded.value?.days ?? []).map(item => ({
  id: item.day_id,
  label: `День ${item.position}`,
  to: `${tripPath.value}/days/${item.day_id}/route${fromMap.value ? '?from=map' : ''}`,
})))
const mapMode = computed(() => mode.value === 'draw' ? 'build' as const : mode.value)
const mapSelection = computed(() => selection.value ? { kind: selection.value.type, id: selection.value.id } : null)
const mapPoints = computed(() => draft.value.points.map((point, index) => ({
  id: point.point_id, position: point.position, label: point.name || `Точка ${index + 1}`, number: index + 1,
})))
const mapTracks = computed(() => draft.value.tracks.map(track => ({
  id: track.track_id, coordinates: track.coordinates, transportMode: track.transport_mode,
  dashed: track.status !== 'ready' || track.build_mode === 'straight',
})))
const mapPois = computed(() => pois.value.map(poi => ({ id: poi.poi_id, position: poi.position, label: poi.name })))
const mapHint = computed(() => preview.value ? {
  from: preview.value.from.requested, requested: preview.value.to.requested, snapped: preview.value.to.snapped ?? undefined,
  coordinates: preview.value.geometry as [number, number][] | undefined ?? undefined,
} : null)
const help = computed(() => {
  if (mode.value === 'split') return 'Выбери место деления на выделенном треке'
  if (mode.value === 'move') return 'Выбери новое положение точки'
  if (mode.value === 'poi') return 'Выбери место для точки интереса'
  if (mode.value === 'draw') return draft.value.points.length ? 'Добавь следующую точку на карте' : 'Выбери начальную точку'
  return undefined
})

function showLoadError(error: unknown) {
  if (request.signal.aborted) return
  loadIssue.value = describeEditorError(error)
  signIn.value = editorProblemCode(error) === 'SESSION_REQUIRED'
}

async function loadPois() {
  try {
    const result = await editorApi.listPois({ scope: 'trip', trip_id: props.tripId, limit: 100 }, request.signal)
    if (!request.signal.aborted) pois.value = result.items
  } catch (error) {
    if (!request.signal.aborted) poiIssue.value = describeEditorError(error)
  }
}

async function sync(next: TravelDraft) {
  loaded.value = next
  day.value = next.days.find(item => item.day_id === props.dayId) ?? null
  if (!day.value) {
    loadIssue.value = 'День путешествия недоступен.'
    return
  }
  if (!day.value.route_id) return
  const data = await editorApi.getRoute(day.value.route_id, request.signal)
  if (!request.signal.aborted) {
    ready.value = true
    editor.resetDraft(data)
    void loadPois()
  }
}

async function load() {
  loading.value = true
  loadIssue.value = ''
  signIn.value = false
  try {
    await renewCsrf()
    await sync(await editorApi.getTrip(props.tripId, request.signal))
  } catch (error) {
    showLoadError(error)
  } finally {
    loading.value = false
  }
}

async function startRoute() {
  if (!loaded.value || !day.value || loading.value) return
  if (!key.value) key.value = crypto.randomUUID()
  const tripRevision = loaded.value.trip_revision_id
  const dayId = day.value.day_id
  const commandKey = key.value
  loading.value = true
  loadIssue.value = ''
  try {
    await sync(await editor.requestWithSession(csrf => editorApi.ensureDayRoute(dayId, { trip_revision_id: tripRevision }, {
      csrf, key: commandKey, signal: request.signal,
    })))
    key.value = ''
    editor.setMode('draw')
  } catch (error) {
    if (editorProblemCode(error) === 'TRIP_REVISION_CONFLICT') {
      key.value = ''
      try {
        await sync(await editorApi.getTrip(props.tripId, request.signal))
      } catch (reloadError) {
        showLoadError(reloadError)
        return
      }
    }
    showLoadError(error)
  } finally {
    loading.value = false
  }
}

function focus(item: EditSelection, openDetails: boolean) {
  editor.select(item, openDetails)
  markerFocus.value = { kind: item.type, id: item.id, request: ++focusRequest }
}

function requestClear() {
  if (canClear.value) confirmingClear.value = true
}

async function clearRoute() {
  confirmingClear.value = false
  markerFocus.value = null
  await editor.clearRoute()
}

function beginPositionEdit(type: 'point' | 'track', id: string) {
  if (busy.value || readOnly.value) return
  selection.value = { type, id }
  editor.setMode(type === 'point' ? 'move' : 'split')
}

async function pickPoi(position: Position) {
  if (poiBusy.value) return
  poiIssue.value = ''
  poiBusy.value = true
  try {
    const result = await editorApi.listPoiCategories(request.signal)
    if (!request.signal.aborted) {
      pendingPoi.value = { position, categories: result.items }
      poiCommand = null
    }
  } catch (error) {
    if (!request.signal.aborted) poiIssue.value = describeEditorError(error)
  } finally {
    poiBusy.value = false
  }
}

async function pickCoordinate(position: Position) {
  if (busy.value || readOnly.value) return
  const item = selection.value
  if (mode.value === 'draw') await editor.add(position)
  if (mode.value === 'move' && item?.type === 'point') await editor.move(item.id, position)
  if (mode.value === 'split' && item?.type === 'track') await editor.split(item.id, position)
  if (mode.value === 'poi') await pickPoi(position)
}

function closePoi() {
  poiRequest?.abort()
  activePoi.value = null
}

async function pickMapItem(item: MapSelection) {
  closePoi()
  if (item.kind !== 'poi') {
    editor.select({ type: item.kind, id: item.id })
    return
  }
  poiIssue.value = ''
  const selectionRequest = new AbortController()
  poiRequest = selectionRequest
  try {
    const result = await editorApi.getPoi(item.id, selectionRequest.signal)
    if (!selectionRequest.signal.aborted) activePoi.value = result
  } catch (error) {
    if (selectionRequest.signal.aborted) return
    if (editorProblemCode(error) === 'NOT_FOUND') pois.value = pois.value.filter(poi => poi.poi_id !== item.id)
    poiIssue.value = describeEditorError(error)
  }
}

async function createPoi(input: { name: string; description: string; category_id: string }) {
  if (!pendingPoi.value || poiBusy.value) return
  const body = { ...input, position: pendingPoi.value.position, visibility: 'trip' as const, scope_trip_id: props.tripId }
  const token = JSON.stringify(body)
  if (poiCommand?.token !== token) poiCommand = { token, key: crypto.randomUUID() }
  const commandKey = poiCommand.key
  poiBusy.value = true
  poiIssue.value = ''
  try {
    const result = await editor.requestWithSession(csrf => editorApi.createPoi(body, {
      csrf, key: commandKey, signal: request.signal,
    }))
    if (request.signal.aborted) return
    pois.value = [...pois.value, result]
    pendingPoi.value = null
    editor.setMode('view')
    activePoi.value = result
  } catch (error) {
    if (!request.signal.aborted) poiIssue.value = describeEditorError(error)
  } finally {
    poiBusy.value = false
  }
}

function stopPoi() {
  pendingPoi.value = null
  poiIssue.value = ''
  editor.setMode('view')
}

function guardUnsaved(event: BeforeUnloadEvent) {
  if (!changed.value && !busy.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => changed.value || busy.value
  ? window.confirm('Маршрут содержит несохранённые изменения. Выйти из редактора?')
  : true)
onMounted(() => {
  window.addEventListener('beforeunload', guardUnsaved)
  void load()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', guardUnsaved)
  request.abort()
  closePoi()
  editor.dispose()
})
</script>

<template>
  <RouteEditor
    v-if="ready"
    :title="loaded?.title ?? 'Путешествие'"
    :day-label="dayLabel"
    :day-id="dayId"
    :back-to="backTo"
    :back-label="fromMap ? t('workspace.backToMap') : undefined"
    :other-days="otherDays"
    :draft="draft"
    :mode="mode"
    :mode-help="help"
    :transport-mode="transportMode"
    :build-mode="buildMode"
    :selection="selection"
    :editing="editing"
    :status="status"
    :issue="issue || poiIssue"
    :read-only="readOnly"
    :busy="busy || poiBusy"
    :can-undo="canUndo"
    :can-redo="canRedo"
    :can-clear="canClear"
    :has-local-version="Boolean(localVersion)"
    :viewing-local="reviewingLocal"
    :sign-in-required="signInRequired"
    :preview="preview"
    :conflict="conflict"
    :pending-poi="pendingPoi"
    :active-poi="activePoi"
    @mode-change="editor.setMode"
    @transport-change="transportMode = $event"
    @build-change="buildMode = $event"
    @select="focus"
    @close-editor="editor.closeEditor"
    @update-point="editor.updatePoint"
    @update-track="editor.changeTrack"
    @move-point="beginPositionEdit('point', $event)"
    @split-track="beginPositionEdit('track', $event)"
    @remove-point="editor.dropPoint"
    @clear-route="requestClear"
    @undo="editor.undo"
    @redo="editor.redo"
    @retry="editor.retry"
    @accept-preview="editor.acceptPreview"
    @choose-alternative="editor.chooseAlternative"
    @cancel-preview="editor.cancelPreview"
    @load-server="editor.loadServer"
    @cancel-server="editor.cancelServer"
    @use-server="editor.useServer"
    @keep-local="editor.keepLocal"
    @create-poi="createPoi"
    @cancel-poi="stopPoi"
    @close-poi="closePoi"
  >
    <template #map>
      <ClientOnly>
        <RouteMap
          :points="mapPoints"
          :tracks="mapTracks"
          :pois="mapPois"
          :selection="mapSelection"
          :focus="markerFocus"
          :hint="mapHint"
          :mode="mapMode"
          :center="center"
          :route-key="day?.route_id || undefined"
          :style-url="config.public.routeMapStyle || undefined"
          @coordinate="pickCoordinate"
          @select="pickMapItem"
        />
      </ClientOnly>
    </template>
  </RouteEditor>

  <main v-else class="route-loading">
    <section class="route-loading__panel">
      <NuxtLink :to="backTo">{{ fromMap ? '← ' + t('workspace.backToMap') : '← К программе путешествия' }}</NuxtLink>
      <h1>{{ loaded?.title || 'Редактор маршрута' }}</h1>
      <p v-if="loadIssue" role="alert">{{ loadIssue }}</p>
      <p v-if="loading" role="status">Загружаем маршрут…</p>
      <NuxtLink v-else-if="signIn" class="tk-button tk-button-primary" to="/login">Войти</NuxtLink>
      <button v-else-if="day && !day.route_id" class="tk-button tk-button-primary" type="button" @click="startRoute">
        Начать маршрут · {{ dayLabel }}
      </button>
      <button v-else-if="loadIssue" class="tk-button" type="button" @click="load">Повторить</button>
    </section>
  </main>

  <UiDialog v-if="ready" v-model="confirmingClear" class="route-clear-dialog" :title="t('routeEditor.clearTitle')">
    <p class="route-clear-message">{{ t('routeEditor.clearMessage') }}</p>
    <div class="route-clear-actions">
      <button class="tk-button" type="button" autofocus @click="confirmingClear = false">{{ t('identity.cancel') }}</button>
      <button class="tk-button route-clear-confirm" type="button" @click="clearRoute">{{ t('routeEditor.clearAction') }}</button>
    </div>
  </UiDialog>
</template>

<style scoped>
.route-clear-dialog {
  width: min(calc(100% - 32px), 520px);
  height: fit-content;
  max-height: calc(100dvh - 32px);
  margin: auto;
  border: 1px solid var(--tk-line);
  border-radius: var(--tk-radius-panel);
}

.route-clear-message {
  margin: 0;
}

.route-clear-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--tk-space-2);
  margin-block-start: var(--tk-space-4);
}

.route-clear-confirm {
  border-color: var(--tk-danger);
  color: var(--tk-danger);
}

.route-clear-confirm:hover {
  background: color-mix(in srgb, var(--tk-danger) 9%, var(--tk-surface));
}

.route-loading { min-height: var(--workspace-content-height, 100dvh); display: grid; place-items: center; padding: 1rem; background: var(--tk-canvas); color: var(--tk-ink); }
.route-loading__panel { width: min(100%, 32rem); box-sizing: border-box; padding: clamp(1.25rem, 4vw, 2rem); background: var(--tk-surface); border: 1px solid var(--tk-line); border-radius: var(--tk-radius-panel); }
.route-loading__panel a { color: var(--tk-accent); text-decoration: none; }
.route-loading__panel a.tk-button-primary { color: var(--tk-on-accent); }
.route-loading__panel h1 { margin: 1rem 0; overflow-wrap: anywhere; }
</style>
