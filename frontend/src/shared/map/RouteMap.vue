<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  MapFocus,
  MapHint,
  MapMode,
  MapPoi,
  MapPoint,
  MapPosition,
  MapRendererAdapter,
  MapSelection,
  MapTrack,
} from './types'

const props = withDefaults(defineProps<{
  points?: readonly MapPoint[]
  tracks?: readonly MapTrack[]
  pois?: readonly MapPoi[]
  selection?: MapSelection | null
  focus?: MapFocus | null
  hint?: MapHint | null
  mode?: MapMode
  center?: MapPosition
  styleUrl?: string
  routeKey?: string
}>(), {
  points: () => [],
  tracks: () => [],
  pois: () => [],
  selection: null,
  focus: null,
  hint: null,
  mode: 'view',
  center: undefined,
  styleUrl: undefined,
  routeKey: undefined,
})

const emit = defineEmits<{
  coordinate: [position: MapPosition]
  select: [selection: MapSelection, position: MapPosition]
  ready: []
}>()

const container = ref<HTMLElement>()
const loading = ref(true)
const unavailable = ref(false)
const { app: { baseURL } } = useRuntimeConfig()
let renderer: MapRendererAdapter | undefined
let resize: ResizeObserver | undefined
let disposed = false
let fitted = false
let pendingFocus: MapFocus | null | undefined

function updateCamera(): void {
  if (!renderer || !container.value?.clientWidth || !container.value.clientHeight) return
  if (pendingFocus) {
    if (renderer.focus(pendingFocus)) {
      pendingFocus = null
      fitted = true
    }
  } else if (!fitted) {
    fitted = renderer.fitRoute()
  }
}

function syncScene(): void {
  if (!renderer) return
  renderer.setScene({
    points: props.points, tracks: props.tracks, pois: props.pois,
    mode: props.mode, selection: props.selection, hint: props.hint,
  })
  updateCamera()
}

watch(() => [props.points, props.tracks, props.pois, props.mode, props.selection, props.hint], syncScene)
watch(() => props.focus, target => {
  pendingFocus = target
  updateCamera()
})
watch(() => props.routeKey, () => {
  fitted = false
  syncScene()
})
watch(() => props.styleUrl, value => renderer?.setStyle(value))
watch(() => props.center, value => {
  if (value) renderer?.center(value)
})

onMounted(async () => {
  try {
    const { MapLibreRenderer } = await import('./maplibre-adapter')
    if (disposed || !container.value) return
    renderer = new MapLibreRenderer(container.value, {
      coordinate: position => emit('coordinate', position),
      select: (selection, position) => emit('select', selection, position),
      ready: () => {
        loading.value = false
        emit('ready')
      },
    }, { baseURL, center: props.center, styleUrl: props.styleUrl })
    pendingFocus = props.focus
    syncScene()
    resize = new ResizeObserver(() => {
      if (!container.value?.clientWidth || !container.value.clientHeight) return
      renderer?.resize()
      updateCamera()
    })
    resize.observe(container.value)
  } catch {
    loading.value = false
    unavailable.value = true
  }
})

onBeforeUnmount(() => {
  disposed = true
  resize?.disconnect()
  renderer?.destroy()
})
</script>

<template>
  <div
    class="route-map"
    :data-map-ready="!loading && !unavailable ? 'true' : undefined"
  >
    <div ref="container" class="route-map__canvas" />
    <p v-if="loading" class="route-map__message" role="status">Карта загружается…</p>
    <p v-if="unavailable" class="route-map__message" role="alert">Карта недоступна в этом браузере. Открой схему маршрута.</p>
  </div>
</template>

<style scoped>
.route-map {
  position: relative;
  height: 100%;
  min-height: 12rem;
  overflow: hidden;
  background: #e9ece0;
}

.route-map__canvas {
  position: absolute;
  inset: 0;
}

.route-map__message {
  position: absolute;
  top: 50%;
  left: 50%;
  width: max-content;
  max-width: calc(100% - 3rem);
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid #d5ddd6;
  border-radius: 0.75rem;
  color: #253b36;
  background: #f9fbf5;
  text-align: center;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.route-map :deep(.maplibregl-ctrl-top-right) {
  top: 3.25rem;
}

.route-map :deep(.maplibregl-ctrl-group) {
  overflow: hidden;
  border: 1px solid #fffdf3;
  border-radius: 0.75rem;
  background: #f7faf1;
  box-shadow: 0 2px 9px #29443a2a;
}

.route-map :deep(.maplibregl-ctrl-group button) {
  width: 2.75rem;
  height: 2.75rem;
}

.route-map :deep(.maplibregl-ctrl-scale) {
  border-color: #395651;
  color: #253b36;
  background: #fafcf4ce;
}

.route-map :deep(.maplibregl-ctrl-attrib) {
  color: #2c433f;
  background: #fafcf4f0;
  font-size: 11px;
}

.route-map :deep(.route-map-marker) {
  box-sizing: border-box;
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding: 0;
  border: 0;
  outline: 0;
  display: grid;
  justify-items: center;
  align-items: center;
  isolation: isolate;
  color: #fffdf7;
  background: transparent;
  font: 700 0.75rem/1 Inter, sans-serif;
  cursor: pointer;
}

.route-map :deep(.route-map-marker::before) {
  z-index: -1;
  position: absolute;
  inset: 0.55rem;
  content: '';
  border: 2px solid #fffdf6;
  border-radius: 50%;
  background: #9c4824;
  box-shadow: 0 1px 4px #26352d40;
}

.route-map :deep(.route-map-marker--poi::before) {
  background: #075b62;
  border-radius: 52% 52% 52% 0;
  transform: rotate(-45deg);
}

.route-map :deep(.route-map-marker--poi::after) {
  width: 0.475rem;
  height: 0.475rem;
  border-radius: 50%;
  background: #fffff9;
  content: '';
}

.route-map :deep(.route-map-marker--selected::before),
.route-map :deep(.route-map-marker:hover::before),
.route-map :deep(.route-map-marker:focus-visible::before) {
  box-shadow: 0 0 0 3px #104f52, 0 2px 8px #26352d55;
}

.route-map :deep(.route-map-marker:focus-visible),
.route-map :deep(.maplibregl-canvas:focus-visible) {
  outline: 2px solid #075b62;
  outline-offset: -2px;
}

@media (max-width: 620px) {
  .route-map :deep(.maplibregl-ctrl-top-right) {
    top: 4rem;
  }

  .route-map :deep(.maplibregl-ctrl-scale) {
    margin: 0 0 1.8rem 0.6rem;
  }
}
</style>
