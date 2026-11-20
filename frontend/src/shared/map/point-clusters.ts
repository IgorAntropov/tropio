import { Marker, Popup } from 'maplibre-gl'
import type { GeoJSONSource, Map as LibreMap, MapSourceDataEvent } from 'maplibre-gl'
import type { MapCoordinate, MapPoint } from './types'

const sourceId = 'tropio-public-starts'
const minimumCount = 2

export type ClusterLabels = {
  zoomGroup: (count: number) => string
  unnamedTrip: string
}

export class PointClusters {
  private groups = new Map<number, Marker>()
  private points = new Map<string, MapPoint>()
  private version = 0
  private ready = false
  private fallback = false
  private disposed = false
  private popup?: Popup
  private chosenGroup?: { key: string; tripId: string }

  constructor(
    private map: LibreMap,
    private labels: ClusterLabels,
    private update: () => void,
    private select: (point: MapPoint) => void,
  ) {
    map.on('sourcedata', this.onSource)
    map.on('moveend', this.onMove)
  }

  install() {
    if (this.map.getSource(sourceId)) return
    this.map.addSource(sourceId, {
      type: 'geojson', cluster: true, clusterRadius: 70, maxzoom: 21, clusterMaxZoom: 20,
      data: { type: 'FeatureCollection', features: [] },
    })
    this.map.addLayer({ id: sourceId, type: 'circle', source: sourceId, paint: { 'circle-opacity': 0, 'circle-radius': 1 } })
    this.setPoints([...this.points.values()])
  }

  setPoints(points: readonly MapPoint[]) {
    const version = ++this.version
    this.ready = false
    this.fallback = false
    this.points = new Map(points.map(point => [point.id, point]))
    this.clearGroups()
    const source = this.map.getSource<GeoJSONSource>(sourceId)
    if (!source) return
    const features = points.length < minimumCount ? [] : points.map(point => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [point.position.lon, point.position.lat] },
      properties: { id: point.id },
    }))
    void source.setData({ type: 'FeatureCollection', features }, true).then(() => {
      if (version !== this.version || this.disposed) return
      this.ready = true
      this.update()
    }).catch(() => {
      if (version === this.version && !this.disposed) {
        this.fallback = true
        this.update()
      }
    })
  }

  private onSource = (event: MapSourceDataEvent) => {
    if (event.sourceId === sourceId && this.ready) this.update()
  }
  private onMove = () => { if (this.ready) this.update() }

  visible(): readonly MapPoint[] {
    if (this.points.size < minimumCount || this.fallback) return [...this.points.values()]
    if (!this.ready || !this.map.getSource(sourceId)) return []
    const points = new Map<string, MapPoint>()
    const groups = new Set<number>()
    for (const feature of this.map.querySourceFeatures(sourceId)) {
      if (feature.geometry.type !== 'Point') continue
      const group = feature.properties.cluster_id as number | undefined
      if (group === undefined) {
        const point = this.points.get(feature.properties.id)
        if (point) points.set(point.id, point)
      } else if (!groups.has(group)) {
        groups.add(group)
        if (!this.groups.has(group)) {
          const [lon, lat] = feature.geometry.coordinates
          this.addGroup(group, feature.properties.point_count, [lon!, lat!])
        }
      }
    }
    for (const [group, marker] of this.groups) {
      if (!groups.has(group)) { marker.remove(); this.groups.delete(group) }
    }
    return [...points.values()]
  }

  private addGroup(id: number, count: number, center: MapCoordinate) {
    const key = [id, ...center.map(value => value.toFixed(6))].join(':')
    const button = document.createElement('button')
    if (this.chosenGroup?.key === key && this.points.has(this.chosenGroup.tripId)) button.dataset.clusterTrip = this.chosenGroup.tripId
    button.type = 'button'
    button.className = 'route-map-cluster'
    button.setAttribute('role', 'button')
    button.title = this.labels.zoomGroup(count)
    button.setAttribute('aria-label', button.title)
    button.addEventListener('click', async event => {
      event.stopPropagation()
      const version = this.version
      const source = this.map.getSource<GeoJSONSource>(sourceId)
      const zoom = await source?.getClusterExpansionZoom(id).catch(() => undefined)
      if (!source || zoom === undefined || version !== this.version || this.disposed) return
      if (zoom <= this.map.getMaxZoom() && zoom > this.map.getZoom()) {
        this.map.easeTo({ center, zoom })
        return
      }
      const leaves = await source.getClusterLeaves(id, count, 0).catch(() => [])
      if (version !== this.version || this.disposed || !leaves.length) return
      const list = document.createElement('div')
      list.className = 'trip-cluster-list'
      for (const leaf of leaves) {
        const point = this.points.get(leaf.properties.id)
        if (!point) continue
        const action = document.createElement('button')
        action.type = 'button'
        action.textContent = point.label ?? this.labels.unnamedTrip
        action.addEventListener('click', () => {
          this.chosenGroup = { key, tripId: point.id }
          button.dataset.clusterTrip = point.id
          this.popup?.remove()
          this.select(point)
        })
        list.append(action)
      }
      this.popup?.remove()
      this.popup = new Popup({ maxWidth: '18rem', offset: 16 }).setLngLat(center).setDOMContent(list).addTo(this.map)
      list.querySelector('button')?.focus({ preventScroll: true })
    })
    this.groups.set(id, new Marker({ element: button }).setLngLat(center).addTo(this.map))
  }

  private clearGroups() {
    this.popup?.remove()
    this.popup = undefined
    for (const marker of this.groups.values()) marker.remove()
    this.groups.clear()
  }

  destroy() {
    this.disposed = true
    this.map.off('sourcedata', this.onSource)
    this.map.off('moveend', this.onMove)
    this.clearGroups()
  }
}
