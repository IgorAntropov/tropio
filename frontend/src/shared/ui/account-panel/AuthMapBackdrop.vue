<script setup lang="ts">
import { useId } from 'vue'
import { contourTransform, hillOutline, scenes } from './auth-map-scene'

const id = useId()

const markerSymbols = {
  peak: 'm-7 5 5-10 4 7 2-4 4 7H-7ZM-4-1l2 2 2-2',
  camp: 'm-7 6 7-12L7 6H-7ZM-3 6l3-5 3 5M-2-8l2 2 2-2',
  water: 'M-7-3c2-2 4 2 7 0s5 2 7 0M-7 1c2-2 4 2 7 0s5 2 7 0M-7 5c2-2 4 2 7 0s5 2 7 0',
  lookout: 'M-7 0s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5ZM0-2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
}
</script>

<template>
  <div class="auth-map-backdrop" aria-hidden="true">
    <svg
      v-for="scene in scenes" :key="scene.id" :class="`map-scene map-scene-${scene.id}`"
      :viewBox="scene.viewBox" preserveAspectRatio="xMidYMid slice" focusable="false"
    >
      <defs>
        <pattern :id="`${id}-${scene.id}-grid`" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" class="map-grid-lines" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" class="map-paper" />
      <path v-for="path in scene.land" :key="path" :d="path" class="map-land" />
      <path :d="scene.water" class="map-water" />
      <rect width="100%" height="100%" :fill="`url(#${id}-${scene.id}-grid)`" />
      <g class="map-contours">
        <g
          v-for="hill in scene.hills" :key="hill.x"
          :transform="`translate(${hill.x},${hill.y}) rotate(${hill.angle}) scale(${hill.scale})`"
        >
          <path
            v-for="contour in hill.contours" :key="contour" :d="hillOutline"
            :transform="contourTransform(contour - 1, hill.contours)"
            :class="{ 'map-contour-index': contour % 5 === 1 }"
          />
        </g>
      </g>
      <path :d="scene.shoreline" class="map-shoreline" />
      <path v-for="path in scene.streams" :key="path" :d="path" class="map-stream" />
      <path v-for="path in scene.trails" :key="path" :d="path" class="map-trail" />
      <g
        v-for="route in scene.routes" :key="route.tone" :data-map-route="route.tone"
        :class="`map-route map-tone-${route.tone}`"
      >
        <path :d="route.path" class="map-route-hit" />
        <path :d="route.path" class="map-route-casing" />
        <path :d="route.path" class="map-route-line" />
      </g>
      <g
        v-for="marker in scene.markers" :key="marker.x" :data-map-marker="marker.kind"
        :class="`map-marker map-tone-${marker.tone}`" :transform="`translate(${marker.x},${marker.y})`"
      >
        <circle r="21" class="map-marker-hit" />
        <g class="map-marker-badge">
          <circle r="21" class="map-marker-halo" />
          <circle r="15" class="map-marker-base" />
          <path :d="markerSymbols[marker.kind]" class="map-marker-symbol" />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.auth-map-backdrop {
  --map-paper: #eff0e6;
  --map-land: #dce8d9;
  --map-water: #d1e5e4;
  --map-grid: #829a8e;
  --map-contour: #7e9a85;
  --map-shoreline: #8fb8b6;
  --map-trail: #80978f;
  --map-case: #f8f8ee;
  --map-trail-route: #216867;
  --map-ridge-route: #97623d;
  --map-coast-route: #62778c;
  --map-marker-icon: #fff;
  overflow: hidden;
  background: var(--map-paper);
  pointer-events: none;
}

[data-theme='dark'] .auth-map-backdrop {
  --map-paper: #172621;
  --map-land: #22372a;
  --map-water: #213d3d;
  --map-grid: #78948b;
  --map-contour: #78948b;
  --map-shoreline: #426c70;
  --map-trail: #7a948e;
  --map-case: #172621;
  --map-trail-route: #7cc3b6;
  --map-ridge-route: #d9a776;
  --map-coast-route: #9aaec1;
  --map-marker-icon: #16241e;
}

.map-scene {
  display: block;
  width: 100%;
  height: 100%;
}

.map-scene-narrow {
  display: none;
}

.map-paper {
  fill: var(--map-paper);
}

.map-land {
  fill: var(--map-land);
}

.map-water {
  fill: var(--map-water);
}

.map-grid-lines {
  stroke: var(--map-grid);
  stroke-opacity: .15;
  stroke-width: .6;
}

.map-contours {
  fill: none;
  stroke: var(--map-contour);
  stroke-width: 1;
  stroke-opacity: .32;
}

.map-contours path,
.map-shoreline,
.map-stream,
.map-trail,
.map-route path {
  vector-effect: non-scaling-stroke;
}

.map-contours .map-contour-index {
  stroke-width: 1.35;
  stroke-opacity: .42;
}

.map-shoreline,
.map-stream,
.map-trail,
.map-route path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-shoreline,
.map-stream {
  stroke: var(--map-shoreline);
  stroke-opacity: .63;
}

.map-shoreline {
  stroke-width: 1.3;
}

.map-stream {
  stroke-width: 2;
}

.map-trail {
  stroke: var(--map-trail);
  stroke-width: 1.3;
  stroke-dasharray: 2 5;
  stroke-opacity: .55;
}

.map-tone-trail {
  --map-ink: var(--map-trail-route);
}

.map-tone-ridge {
  --map-ink: var(--map-ridge-route);
}

.map-tone-coast {
  --map-ink: var(--map-coast-route);
}

.map-route-hit {
  stroke: transparent;
  stroke-width: 20;
}

.map-route-casing {
  stroke: var(--map-case);
  stroke-opacity: .78;
  stroke-width: 6;
  transition: stroke-width 220ms ease;
}

.map-route-line {
  stroke: var(--map-ink);
  stroke-width: 2.7;
  stroke-opacity: .78;
  transition: stroke-opacity 220ms ease, stroke-width 220ms ease;
}

.map-tone-ridge .map-route-line {
  stroke-dasharray: 8 5;
}

.map-tone-coast .map-route-line {
  stroke-dasharray: 4 4;
}

.map-marker-hit {
  fill: transparent;
}

.map-marker-badge {
  transition: transform 220ms ease;
}

.map-marker-halo {
  fill: var(--map-ink);
  opacity: 0;
  transform: scale(.76);
  transition: opacity 220ms ease, transform 220ms ease;
}

.map-marker-base {
  fill: var(--map-ink);
  stroke: var(--map-case);
  stroke-width: 3.5;
  vector-effect: non-scaling-stroke;
}

.map-marker-symbol {
  fill: none;
  stroke: var(--map-marker-icon);
  stroke-width: 1.45;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (any-hover: hover) and (any-pointer: fine) {
  .map-route-hit {
    pointer-events: stroke;
  }

  .map-marker-hit {
    pointer-events: fill;
  }

  .map-route:hover .map-route-casing {
    stroke-width: 9;
  }

  .map-route:hover .map-route-line {
    stroke-width: 4.4;
    stroke-opacity: 1;
  }

  .map-marker:hover .map-marker-badge {
    transform: translateY(-3px);
  }

  .map-marker:hover .map-marker-halo {
    opacity: .22;
    transform: scale(1.12);
  }
}

@media (max-width: 620px) {
  .map-scene-wide {
    display: none;
  }

  .map-scene-narrow {
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .map-route-casing,
  .map-route-line,
  .map-marker-badge,
  .map-marker-halo {
    transition: none;
  }
}
</style>
