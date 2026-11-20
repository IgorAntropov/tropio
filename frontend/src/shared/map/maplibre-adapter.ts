import { LngLatBounds, Map, Marker, NavigationControl, ScaleControl } from 'maplibre-gl'
import type { GeoJSONSource, LineLayerSpecification, MapMouseEvent, StyleSpecification } from 'maplibre-gl'
import { PointClusters, type ClusterLabels } from './point-clusters'
import { TripFlightCamera } from './trip-flight'
import { continuousTrack, nearestWorld } from './world-coordinates'
import { pilotBasemap, tomskCenter, tomskZoom } from './basemap'
import type {
  MapCoordinate,
  MapFocus,
  MapFlightPhase,
  MapPoint,
  MapPosition,
  MapRendererAdapter,
  MapScene,
  MapSelection,
  MapTripFlight,
} from './types'

type MapEvents = {
  coordinate(position: MapPosition): void
  select(selection: MapSelection, position: MapPosition): void
  ready(): void
  flightEnd(): void
}

type MarkerRecord = { marker: Marker; button: HTMLButtonElement; label?: HTMLElement; feature: MapPoint; selection: MapSelection }

const layerPrefix = 'tropio-editor-'
const linesSource = layerPrefix + 'tracks'
const hintsSource = layerPrefix + 'hint'
const hitLayer = layerPrefix + 'track-hit'

const ordinal = new Intl.NumberFormat('ru-RU')

function coords(position: MapPosition): MapCoordinate {
  return [position.lon, position.lat]
}

function duration(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 230
}

function collection<T>(features: T[]) {
  return { type: 'FeatureCollection' as const, features }
}

function line(coordinates: MapCoordinate[], properties: Record<string, string | boolean>) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'LineString' as const, coordinates },
    properties,
  }
}

function point(position: MapPosition, kind: string) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: coords(position) },
    properties: { kind },
  }
}

function sameSelection(left: MapSelection | undefined | null, right: MapSelection) {
  return left?.id === right.id && left.kind === right.kind
}

function localResource(path?: string): string | undefined {
  if (!path) return undefined
  try {
    const url = new URL(path, window.location.href)
    return url.origin === window.location.origin && !url.username && !url.password ? url.href : undefined
  } catch {
    return undefined
  }
}

type Rect = { x: number; y: number; width: number; height: number }
type LabelAnchor = { label: HTMLElement; point: { x: number; y: number } }

function overlap(a: Rect, b: Rect) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
}

function placeTripLabels(container: HTMLElement, items: LabelAnchor[]) {
  if (!items.length || !container.clientWidth) return
  const viewport = container.getBoundingClientRect()
  const frame = container.closest('[data-map-frame]') ?? container
  const controls = frame.querySelectorAll('[data-map-overlay], .maplibregl-ctrl')
  const occupied: Rect[] = Array.from(controls, element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.left - viewport.left - 3, y: rect.top - viewport.top - 3, width: rect.width + 6, height: rect.height + 6 }
  })
  const visible = items.filter(({ point }) => point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height)
  for (const { point } of visible) occupied.push({ x: point.x - 11, y: point.y - 23, width: 22, height: 25 })
  for (const { label, point } of visible) {
    const width = label.offsetWidth
    const height = label.offsetHeight
    const centered = point.x - width / 2
    const below = point.y + 7
    const choices = [
      [centered, below], [centered - width / 4, below], [centered + width / 4, below],
      [centered, below + 8], [point.x - width + 12, below], [point.x - 12, below],
    ] as const
    let best: Rect | undefined
    let penalty = Infinity
    for (const [left, top] of choices) {
      const x = Math.max(4, Math.min(left, viewport.width - width - 4))
      const y = top
      const rect = { x, y, width, height }
      const score = occupied.reduce((sum, other) => sum + overlap(rect, other), 0) + Math.abs(x - left) + Math.abs(y - top)
      if (score < penalty) { best = rect; penalty = score }
      if (!score) break
    }
    if (best) {
      label.style.setProperty('--label-x', Math.round(best.x - point.x) + 'px')
      label.style.setProperty('--label-y', Math.round(best.y - point.y) + 'px')
      occupied.push(best)
    }
  }
}

export class MapLibreRenderer implements MapRendererAdapter {
  private readonly map: Map
  private readonly basemap: StyleSpecification
  private readonly markers = new globalThis.Map<string, MarkerRecord>()
  private scene: MapScene = { points: [], tracks: [], pois: [], mode: 'view' }
  private clusters?: PointClusters
  private readonly flight: TripFlightCamera
  private styleUrl?: string
  private hoveredTrack: string | null = null

  constructor(
    container: HTMLElement,
    private readonly events: MapEvents,
    options: { baseURL: string; center?: MapPosition; styleUrl?: string; clusterLabels?: ClusterLabels },
  ) {
    this.basemap = pilotBasemap(options.baseURL)
    this.styleUrl = localResource(options.styleUrl)
    this.map = new Map({
      container,
      center: coords(options.center ?? tomskCenter),
      zoom: tomskZoom,
      style: this.styleUrl || this.basemap,
      maxZoom: 20,
      pitchWithRotate: false,
      dragRotate: false,
      renderWorldCopies: false,
      attributionControl: {
        compact: false,
        customAttribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
      },
      transformRequest: url => ({ url: localResource(url) ?? 'about:blank' }),
      locale: {
        'NavigationControl.ZoomIn': 'Приблизить',
        'NavigationControl.ZoomOut': 'Отдалить',
        'Map.Title': 'Карта маршрута',
        'ScaleControl.Kilometers': 'км',
        'ScaleControl.Meters': 'м',
        'AttributionControl.ToggleAttribution': 'Источники карты',
      },
    })
    this.flight = new TripFlightCamera(this.map, events.flightEnd)
    if (options.clusterLabels) {
      this.clusters = new PointClusters(this.map, options.clusterLabels, () => this.syncMarkers(), point =>
        this.events.select({ kind: 'point', id: point.id }, point.position))
    }
    this.map.on('moveend', this.positionLabels)
    this.map.on('resize', this.positionLabels)
    this.map.touchZoomRotate.disableRotation()
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    this.map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    this.map.on('styledata', this.prepareStyle)
    this.map.on('error', this.fallbackStyle)
    this.map.on('click', this.handleClick)
    this.map.on('mousemove', this.handleMove)
    this.map.on('mouseout', this.handleLeave)
    this.map.getCanvas().addEventListener('keydown', this.handleKeyboard)
  }

  setStyle(styleUrl?: string): void {
    const style = localResource(styleUrl)
    if (this.styleUrl === style) return
    this.styleUrl = style
    this.map.setStyle(style || this.basemap, { diff: false })
  }

  approachTrip(flight: MapTripFlight, scene: MapScene): MapFlightPhase {
    return this.flight.update(flight, scene)
  }

  leaveTrip(): boolean {
    return this.flight.leave()
  }

  private fallbackStyle = (): void => {
    if (this.styleUrl && !this.map.getLayer(layerPrefix + 'track')) this.setStyle()
  }

  private prepareStyle = (): void => {
    if (!this.map.getStyle() || this.map.getSource(linesSource)) return
    this.clusters?.install()
    this.map.addSource(linesSource, { type: 'geojson', data: collection([]) })
    this.map.addSource(hintsSource, { type: 'geojson', data: collection([]) })
    const transport: NonNullable<LineLayerSpecification['paint']>['line-color'] = [
      'match', ['get', 'transport'], 'bicycle', '#146b6e', 'foot', '#7957a0', '#a54b25',
    ]
    const layout = { 'line-cap': 'round', 'line-join': 'round' } as const
    this.map.addLayer({
      id: layerPrefix + 'selected', type: 'line', source: linesSource, layout,
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': '#1e575a', 'line-opacity': 0.30, 'line-width': 15 },
    })
    this.map.addLayer({
      id: layerPrefix + 'track-casing', type: 'line', source: linesSource, layout,
      paint: { 'line-color': '#fffaf0', 'line-width': 9 },
    })
    this.map.addLayer({
      id: layerPrefix + 'track', type: 'line', source: linesSource, layout,
      filter: ['!=', ['get', 'dashed'], true],
      paint: { 'line-color': transport, 'line-width': 5.5 },
    })
    this.map.addLayer({
      id: layerPrefix + 'dashed', type: 'line', source: linesSource, layout,
      filter: ['==', ['get', 'dashed'], true],
      paint: { 'line-color': transport, 'line-width': 5.5, 'line-dasharray': [1.3, 1] },
    })
    this.map.addLayer({
      id: hitLayer, type: 'line', source: linesSource, layout,
      paint: { 'line-color': '#fff', 'line-width': 25, 'line-opacity': 0 },
    })
    this.map.addLayer({
      id: layerPrefix + 'proposal', type: 'line', source: hintsSource, layout,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#0b666b', 'line-width': 4, 'line-dasharray': [1.4, 1] },
    })
    this.map.addLayer({
      id: layerPrefix + 'proposal-point', type: 'circle', source: hintsSource,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': ['match', ['get', 'kind'], 'requested', '#f7faf1', '#13767b'],
        'circle-radius': 7,
        'circle-stroke-color': '#0b666b',
        'circle-stroke-width': 2.5,
      },
    })
    this.updateTracks()
    this.updateHint()
    this.updateHighlight()
    this.map.once('idle', this.events.ready)
  }

  setScene(scene: MapScene): void {
    const previous = this.scene
    this.scene = scene
    if (scene.mode !== previous.mode) {
      if (scene.mode === 'view') this.map.doubleClickZoom.enable()
      else this.map.doubleClickZoom.disable()
    }
    if (scene.clusterPoints !== previous.clusterPoints || (scene.clusterPoints && scene.points !== previous.points)) {
      this.clusters?.setPoints(scene.clusterPoints ? scene.points : [])
    }
    if (scene.tracks !== previous.tracks) this.updateTracks()
    if (scene.hint !== previous.hint) this.updateHint()
    if (scene.selection !== previous.selection) this.updateHighlight()
    this.syncMarkers()
    this.updateCursor()
  }

  private updateTracks(): void {
    const lines = this.scene.tracks
      .filter(track => track.coordinates.length >= 2)
      .map(track => line(this.map.getRenderWorldCopies() ? continuousTrack(track.coordinates) : track.coordinates, {
        id: track.id,
        transport: track.transportMode ?? '',
        dashed: track.dashed ?? false,
      }))
    this.map.getSource<GeoJSONSource>(linesSource)?.setData(collection(lines))
  }

  private updateHint(): void {
    const hint = this.scene.hint
    const features = []
    if (hint) {
      if (hint.coordinates && hint.coordinates.length >= 2) features.push(line(hint.coordinates, {}))
      else if (hint.from) features.push(line([coords(hint.from), coords(hint.requested)], {}))
      features.push(point(hint.requested, 'requested'))
      if (hint.snapped) {
        features.push(line([coords(hint.requested), coords(hint.snapped)], {}), point(hint.snapped, 'snapped'))
      }
    }
    this.map.getSource<GeoJSONSource>(hintsSource)?.setData(collection(features))
  }

  private updateHighlight(): void {
    const selected = this.scene.selection
    if (this.map.getLayer(layerPrefix + 'selected')) {
      const id = this.hoveredTrack ?? (selected?.kind === 'track' ? selected.id : '')
      this.map.setFilter(layerPrefix + 'selected', ['==', ['get', 'id'], id])
    }
  }

  private trackAt(event: MapMouseEvent): string | undefined {
    if (!this.map.getLayer(hitLayer)) return undefined
    const [hit] = this.map.queryRenderedFeatures(event.point, { layers: [hitLayer] })
    return typeof hit?.properties.id === 'string' ? hit.properties.id : undefined
  }

  private handleClick = (event: MapMouseEvent): void => {
    const position = { lon: event.lngLat.wrap().lng, lat: event.lngLat.lat }
    const mode = this.scene.mode
    if (mode === 'split' || mode === 'move' || mode === 'poi') {
      this.events.coordinate(position)
      return
    }
    const trackId = this.trackAt(event)
    if (trackId) this.events.select({ kind: 'track', id: trackId }, position)
    else if (mode === 'build') this.events.coordinate(position)
  }

  private handleMove = (event: MapMouseEvent): void => {
    const target = event.originalEvent.target
    if (target instanceof Element && target.closest('.route-map-marker')) {
      this.handleLeave()
      return
    }

    const id = this.trackAt(event) ?? null
    if (id === this.hoveredTrack) return
    this.hoveredTrack = id
    this.updateHighlight()
    this.updateCursor()
  }

  private handleLeave = (): void => {
    if (this.hoveredTrack === null) return
    this.hoveredTrack = null
    this.updateHighlight()
    this.updateCursor()
  }

  private updateCursor(): void {
    const { mode } = this.scene
    const selectingTrack = this.hoveredTrack && (mode === 'view' || mode === 'build')
    this.map.getCanvas().style.cursor = selectingTrack ? 'pointer' : mode === 'view' ? '' : 'crosshair'
  }

  private handleKeyboard = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || this.scene.mode === 'view') return
    event.preventDefault()
    const { lng, lat } = this.map.getCenter().wrap()
    this.events.coordinate({ lon: lng, lat })
  }

  private addMarker(feature: MapPoint, selection: MapSelection): MarkerRecord {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'button')
    button.classList.add('route-map-marker', 'route-map-marker--' + selection.kind)
    const label = this.scene.tripMarkers && selection.kind === 'point' ? document.createElement('span') : undefined
    if (label) {
      button.classList.add('route-map-marker--trip')
      label.className = 'trip-marker-label'
      button.append(label)
    }
    const marker = new Marker({ element: button }).setLngLat(coords(feature.position)).addTo(this.map)
    const record = { marker, button, feature, selection, label }
    button.addEventListener('pointerenter', this.handleLeave)
    button.addEventListener('click', event => {
      event.stopPropagation()
      const mode = this.scene.mode
      if (mode === 'split' || mode === 'move' || mode === 'poi') this.events.coordinate(record.feature.position)
      else this.events.select(record.selection, record.feature.position)
    })
    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat().wrap()
      marker.setLngLat(coords(record.feature.position))
      this.events.coordinate({ lon: lng, lat })
    })
    return record
  }

  private syncMarkers(): void {
    const visible = new Set<string>()
    const points = this.scene.clusterPoints && this.clusters ? this.clusters.visible() : this.scene.points
    for (const [kind, features] of [['point', points], ['poi', this.scene.pois]] as const) {
      for (const feature of features) {
        const key = (kind === 'point' && this.scene.tripMarkers ? 'trip' : kind) + ':' + feature.id
        visible.add(key)
        const selection = { kind, id: feature.id }
        const record = this.markers.get(key) ?? this.addMarker(feature, selection)
        this.markers.set(key, record)
        const selected = sameSelection(this.scene.selection, selection)
        record.feature = feature
        record.marker.setLngLat(coords(feature.position))
        record.marker.setDraggable(kind === 'point' && selected && this.scene.mode === 'move')
        record.button.classList.toggle('route-map-marker--selected', selected)
        record.button.disabled = this.scene.interactiveMarkers === false
        record.button.setAttribute('aria-pressed', String(selected))
        const number = feature.number === undefined ? undefined : ordinal.format(feature.number)
        const label = feature.label || (kind === 'point' ? ('Точка ' + (number ?? '')).trim() : 'Место')
        if (record.label) {
          if (record.label.textContent !== label) record.label.textContent = label
        } else {
          record.button.textContent = kind === 'point' ? number ?? '' : ''
        }
        record.button.title = label
        record.button.setAttribute('aria-label', label)
      }
    }
    for (const [key, record] of this.markers) {
      if (visible.has(key)) continue
      record.marker.remove()
      this.markers.delete(key)
    }
    if (this.scene.tripMarkers) this.positionLabels()
  }

  private positionLabels = (): void => {
    if (!this.scene.tripMarkers) return
    const items = Array.from(this.markers.values()).flatMap(({ marker, label }) =>
      label ? [{ label, point: this.map.project(marker.getLngLat()) }] : [])
    placeTripLabels(this.map.getContainer(), items)
  }

  private fit(positions: MapCoordinate[]): boolean {
    if (!positions.length || this.map.getContainer().clientWidth === 0) return false
    if (positions.length === 1) {
      this.map.easeTo({ center: positions[0], zoom: Math.max(this.map.getZoom(), 14), duration: duration() })
      return true
    }
    const bounds = new LngLatBounds()
    const copies = this.map.getRenderWorldCopies()
    const first = positions[0]![0]
    for (const position of positions) bounds.extend(copies ? nearestWorld(position, first) : position)
    const parent = this.map.getContainer()
    const padding = Math.min(92, Math.floor(Math.min(parent.clientWidth, parent.clientHeight) / 4))
    this.map.fitBounds(bounds, { padding, maxZoom: 16, duration: duration() })
    return true
  }

  fitRoute(): boolean {
    const paths = this.scene.tracks.flatMap(track => track.coordinates)
    return this.fit(paths.concat(this.scene.points.map(feature => coords(feature.position))))
  }

  focus(target: MapFocus): boolean {
    if (target.kind === 'track') {
      const track = this.scene.tracks.find(track => track.id === target.id)
      return track ? this.fit(track.coordinates) : false
    }
    const features = target.kind === 'point' ? this.scene.points : this.scene.pois
    const targetPoint = features.find(feature => feature.id === target.id)
    return targetPoint ? this.fit([coords(targetPoint.position)]) : false
  }

  center(position: MapPosition): void {
    this.map.easeTo({ center: coords(position), duration: duration() })
  }

  resize(): void {
    this.map.resize()
  }

  destroy(): void {
    this.flight.destroy()
    this.map.getCanvas().removeEventListener('keydown', this.handleKeyboard)
    for (const { marker } of this.markers.values()) marker.remove()
    this.markers.clear()
    this.clusters?.destroy()
    this.map.remove()
  }
}
