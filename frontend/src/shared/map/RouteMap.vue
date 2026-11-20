<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import type {
  MapFlightPhase,
  MapFocus,
  MapHint,
  MapMode,
  MapPoi,
  MapPoint,
  MapPosition,
  MapRendererAdapter,
  MapScene,
  MapSelection,
  MapTrack,
  MapTripFlight,
} from './types';

const props = withDefaults(defineProps<{
  points?: readonly MapPoint[];
  tracks?: readonly MapTrack[];
  pois?: readonly MapPoi[];
  selection?: MapSelection | null;
  focus?: MapFocus | null;
  hint?: MapHint | null;
  mode?: MapMode;
  center?: MapPosition;
  styleUrl?: string;
  clusterPoints?: boolean;
  tripMarkers?: boolean;
  unavailableText?: string;
  routeKey?: string;
  tripFlight?: MapTripFlight | null;
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
  unavailableText: 'Карта недоступна в этом браузере. Открой схему маршрута.',
  routeKey: undefined,
  tripFlight: null,
});

const emit = defineEmits<{
  coordinate: [position: MapPosition];
  select: [selection: MapSelection, position: MapPosition];
  ready: [];
}>();

const container = ref<HTMLElement>();
const loading = ref(true);
const unavailable = ref(false);
const flightPhase = ref<MapFlightPhase>();
const { app: { baseURL } } = useRuntimeConfig();
const { t } = useI18n();
let renderer: MapRendererAdapter | undefined;
let resize: ResizeObserver | undefined;
let disposed = false;
let fitted = false;
let pendingFocus: MapFocus | null | undefined;
let lastFocus: MapFocus | null | undefined;
let lastRouteKey: string | undefined;
let flightId: string | undefined;
let publicationId: string | undefined;
const emptyScene: MapScene = {
  points: [],
  tracks: [],
  pois: [],
  mode: 'view',
};

function updateCamera(): void {
  if (!renderer || !container.value?.clientWidth || !container.value.clientHeight) {
    return;
  }
  if (pendingFocus) {
    if (renderer.focus(pendingFocus)) {
      pendingFocus = null;
      fitted = true;
    }
  }
  else if (!fitted) {
    fitted = renderer.fitRoute();
  }
}

function syncScene(): void {
  if (!renderer || disposed) {
    return;
  }
  const flight = props.tripFlight;
  const changedRoute = lastRouteKey !== props.routeKey;
  lastRouteKey = props.routeKey;
  if (props.focus !== lastFocus) {
    pendingFocus = props.focus;
  }
  lastFocus = props.focus;
  const scene = {
    points: props.points,
    tracks: props.tracks,
    pois: props.pois,
    mode: props.mode,
    selection: props.selection,
    hint: props.hint,
    tripMarkers: !flight && props.tripMarkers,
    clusterPoints: !flight && props.clusterPoints,
  };
  if (flight) {
    const wasArrived = flightId === flight.id && publicationId === flight.publicationId && flightPhase.value === 'arrived';
    flightId = flight.id;
    publicationId = flight.publicationId;
    flightPhase.value = renderer.approachTrip(flight, scene);
    if (flightPhase.value !== 'arrived') {
      renderer.setScene(flight.marker
        ? {
            ...emptyScene,
            points: [flight.marker],
            tripMarkers: true,
            interactiveMarkers: false,
          }
        : emptyScene);
      return;
    }
    if (!wasArrived) {
      fitted = true;
    }
    else if (changedRoute) {
      fitted = false;
    }
  }
  else if (flightId) {
    flightId = undefined;
    publicationId = undefined;
    flightPhase.value = undefined;
    pendingFocus = null;
    fitted = renderer.leaveTrip();
  }
  else if (changedRoute) {
    fitted = false;
  }
  renderer.setScene(scene);
  updateCamera();
}

watch(() => [
  props.points, props.tracks, props.pois, props.mode, props.selection, props.hint, props.focus,
  props.routeKey, props.tripFlight, props.clusterPoints, props.tripMarkers,
], syncScene, { flush: 'post' });
watch(() => props.styleUrl, value => renderer?.setStyle(value));
watch(() => props.center, (value) => {
  if (value) {
    renderer?.center(value);
  }
});

onMounted(async () => {
  try {
    const { MapLibreRenderer } = await import('./maplibre-adapter');
    if (disposed || !container.value) {
      return;
    }
    renderer = new MapLibreRenderer(container.value, {
      coordinate: position => emit('coordinate', position),
      select: (selection, position) => emit('select', selection, position),
      flightEnd: () => queueMicrotask(syncScene),
      ready: () => {
        loading.value = false;
        emit('ready');
      },
    }, {
      baseURL,
      center: props.center,
      styleUrl: props.styleUrl,
      clusterLabels: props.clusterPoints
        ? {
            zoomGroup: count => t('catalog.zoomCluster', { count }),
            unnamedTrip: t('catalog.unnamedTrip'),
          }
        : undefined,
    });
    syncScene();
    resize = new ResizeObserver(() => {
      if (!container.value?.clientWidth || !container.value.clientHeight) {
        return;
      }
      renderer?.resize();
      syncScene();
    });
    resize.observe(container.value);
  }
  catch {
    loading.value = false;
    unavailable.value = true;
  }
});

onBeforeUnmount(() => {
  disposed = true;
  resize?.disconnect();
  renderer?.destroy();
});
</script>

<template>
  <div
    class="route-map"
    :data-map-ready="!loading && !unavailable ? 'true' : undefined"
    :data-trip-flight="flightPhase"
  >
    <div ref="container" class="route-map__canvas" :inert="flightPhase === 'flying'" />
    <p v-if="loading" class="route-map__message" role="status">Карта загружается…</p>
    <p v-if="unavailable" class="route-map__message" role="alert">{{ unavailableText }}</p>
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
  background: var(--route-control-background, #f7faf1);
  backdrop-filter: var(--route-control-backdrop, none);
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

.route-map :deep(.route-map-marker--trip) {
  width: 44px;
  height: 44px;
  z-index: 1;
}

.route-map :deep(.route-map-marker--trip::before) {
  inset: auto;
  top: 0;
  width: 21px;
  height: 21px;
  border-radius: 50% 50% 50% 0;
  border: 2px solid white;
  background: var(--tk-accent);
  transform: rotate(-45deg);
}

.route-map :deep(.route-map-marker--trip::after) {
  position: absolute;
  top: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: white;
  content: '';
}

.route-map :deep(.trip-marker-label) {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(var(--label-x, -50%), var(--label-y, 7px));
  width: max-content;
  max-width: 10.5rem;
  padding: .25rem .5rem;
  border: 1px solid rgb(255 255 255 / 70%);
  border-radius: .5rem;
  background: color-mix(in srgb, var(--tk-surface) 64%, transparent);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  color: var(--tk-ink);
  box-shadow: 0 1px 4px #203c372b;
  font: 650 .75rem/1.25 Inter, sans-serif;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.route-map :deep(.route-map-marker--trip:is([aria-pressed="true"], :focus-visible, :hover)) {
  z-index: 2;
}

.route-map :deep(.route-map-marker--trip[aria-pressed="true"] .trip-marker-label) {
  border-color: color-mix(in srgb, var(--tk-accent) 75%, transparent);
  background: color-mix(in srgb, var(--tk-selected) 70%, transparent);
  color: var(--tk-accent);
}

.route-map :deep(.route-map-cluster::before) {
  content: '';
  display: block;
  margin: auto;
  width: 15px;
  height: 12px;
  border: 2px solid currentColor;
  border-radius: 3px;
  box-shadow: 3px -3px var(--tk-accent), 4px -4px currentColor;
}

.route-map :deep(.trip-cluster-list) {
  display: grid;
  gap: 2px;
  max-height: 13rem;
  overflow: auto;
}

.route-map :deep(.trip-cluster-list button) {
  min-height: 44px;
  border: 0;
  border-radius: .5rem;
  padding: .4rem .75rem;
  color: var(--tk-ink);
  background: var(--tk-surface);
  text-align: start;
  font: 600 .81rem/1.35 Inter, sans-serif;
  cursor: pointer;
}

.route-map :deep(.trip-cluster-list button:is(:hover, :focus-visible)) {
  background: var(--tk-selected);
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
