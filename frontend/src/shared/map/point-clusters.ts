import { Marker } from 'maplibre-gl';
import type {
  GeoJSONSource,
  Map as LibreMap,
} from 'maplibre-gl';
import type {
  MapCoordinate,
  MapPoint,
} from './types';

const sourceId = 'tropio-public-starts';
const minimumCount = 2;

export type ClusterLabels = {
  zoomGroup: (count: number) => string;
  groupCount: (count: number) => string;
};

export class PointClusters {
  private groups = new Map<number, Marker>();
  private points = new Map<string, MapPoint>();
  private visiblePoints: MapPoint[] = [];
  private version = 0;
  private zoomRequest = 0;
  private ready = false;
  private fallback = false;
  private disposed = false;

  constructor(
    private map: LibreMap,
    private labels: ClusterLabels,
    private update: () => void,
  ) {
    map.on('idle', this.onIdle);
  }

  install() {
    if (this.map.getSource(sourceId)) {
      return;
    }
    this.map.addSource(sourceId, {
      type: 'geojson',
      cluster: true,
      clusterRadius: 70,
      maxzoom: 21,
      clusterMaxZoom: 20,
      data: { type: 'FeatureCollection', features: [] },
    });
    this.map.addLayer({
      id: sourceId,
      type: 'circle',
      source: sourceId,
      paint: { 'circle-opacity': 0, 'circle-radius': 1 },
    });
    this.setPoints([...this.points.values()]);
  }

  setPoints(points: readonly MapPoint[]) {
    const version = ++this.version;
    this.ready = false;
    this.fallback = false;
    this.points = new Map(points.map(point => [point.id, point]));
    this.visiblePoints = [];
    this.clearGroups();
    const source = this.map.getSource<GeoJSONSource>(sourceId);
    if (!source) {
      return;
    }
    const features = points.length < minimumCount
      ? []
      : points.map(point => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [point.position.lon, point.position.lat] },
          properties: { id: point.id },
        }));
    void source.setData({ type: 'FeatureCollection', features }, true).then(() => {
      if (version !== this.version || this.disposed) {
        return;
      }
      this.ready = true;
      this.update();
    }).catch(() => {
      if (version === this.version && !this.disposed) {
        this.fallback = true;
        this.update();
      }
    });
  }

  visible(): readonly MapPoint[] {
    return this.points.size < minimumCount || this.fallback ? [...this.points.values()] : this.visiblePoints;
  }

  private onIdle = () => {
    if (!this.ready || this.points.size < minimumCount || !this.map.isSourceLoaded(sourceId)) {
      return;
    }
    const points = new Map<string, MapPoint>();
    const groups = new Set<number>();
    const atLimit = this.map.getZoom() >= this.map.getMaxZoom();
    for (const feature of this.map.querySourceFeatures(sourceId)) {
      if (feature.geometry.type !== 'Point') {
        continue;
      }
      const group = feature.properties.cluster_id as number | undefined;
      if (group === undefined) {
        const point = this.points.get(feature.properties.id);
        if (point) {
          points.set(point.id, point);
        }
      }
      else if (!groups.has(group)) {
        groups.add(group);
        const count = feature.properties.point_count;
        let marker = this.groups.get(group);
        if (!marker) {
          const [lon, lat] = feature.geometry.coordinates;
          marker = this.addGroup(group, count, [lon!, lat!]);
          this.groups.set(group, marker);
        }
        const button = marker.getElement();
        if (button.getAttribute('aria-disabled') !== String(atLimit)) {
          button.setAttribute('aria-disabled', String(atLimit));
          button.setAttribute('aria-label', atLimit ? this.labels.groupCount(count) : this.labels.zoomGroup(count));
        }
      }
    }
    for (const [group, marker] of this.groups) {
      if (!groups.has(group)) {
        if (marker.getElement() === document.activeElement) {
          this.map.getCanvas().focus({ preventScroll: true });
        }
        marker.remove();
        this.groups.delete(group);
      }
    }
    this.visiblePoints = [...points.values()];
    this.update();
  };

  private addGroup(id: number, count: number, center: MapCoordinate) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'route-map-cluster';
    button.textContent = String(count);
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (this.map.getZoom() >= this.map.getMaxZoom()) {
        return;
      }
      const request = ++this.zoomRequest;
      const source = this.map.getSource<GeoJSONSource>(sourceId);
      const expansion = await source?.getClusterExpansionZoom(id).catch(() => undefined);
      if (expansion === undefined || request !== this.zoomRequest || this.groups.get(id)?.getElement() !== button) {
        return;
      }
      const zoom = Math.min(expansion, this.map.getMaxZoom());
      if (zoom > this.map.getZoom()) {
        this.map.easeTo({ center, zoom });
      }
    });
    return new Marker({ element: button }).setLngLat(center).addTo(this.map);
  }

  private clearGroups() {
    for (const marker of this.groups.values()) {
      marker.remove();
    }
    this.groups.clear();
  }

  destroy() {
    this.disposed = true;
    this.map.off('idle', this.onIdle);
    this.clearGroups();
  }
}
