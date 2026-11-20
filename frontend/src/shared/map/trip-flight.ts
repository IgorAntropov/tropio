import {
  LngLat,
  LngLatBounds,
  MercatorCoordinate,
} from 'maplibre-gl';
import type {
  CameraOptions,
  Map as LibreMap,
  Subscription,
} from 'maplibre-gl';
import type {
  MapCoordinate,
  MapFlightPhase,
  MapScene,
  MapTripFlight,
} from './types';
import { nearestWorld } from './world-coordinates';

function motionDuration(milliseconds: number) {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : milliseconds;
}

function destination(map: LibreMap, start: MapCoordinate, scene: MapScene, bottomInset?: number) {
  const bounds = new LngLatBounds(start, start);
  for (const track of scene.tracks) {
    let previous = start[0];
    for (const position of track.coordinates) {
      const next = nearestWorld(position, previous);
      bounds.extend(next);
      previous = next[0];
    }
  }
  for (const { position } of scene.points) {
    bounds.extend(nearestWorld([position.lon, position.lat], start[0]));
  }
  const anchor = MercatorCoordinate.fromLngLat(start);
  const northwest = MercatorCoordinate.fromLngLat(bounds.getNorthWest());
  const southeast = MercatorCoordinate.fromLngLat(bounds.getSouthEast());
  const dx = Math.max(anchor.x - northwest.x, southeast.x - anchor.x);
  const dy = Math.max(anchor.y - northwest.y, southeast.y - anchor.y);
  if (dx + dy < 1e-10) {
    return { center: start, zoom: 15 };
  }
  const { width, height } = map.transform;
  const padding = Math.min(70, Math.floor(Math.min(width, height) / 5));
  const frame = new LngLatBounds(
    new MercatorCoordinate(anchor.x - dx, anchor.y + dy).toLngLat(),
    new MercatorCoordinate(anchor.x + dx, anchor.y - dy).toLngLat(),
  );
  const bottom = bottomInset === undefined ? padding : Math.max(padding, Math.min(bottomInset + 22, height - padding - 1));
  const camera = map.cameraForBounds(frame, { padding: {
    top: padding,
    bottom,
    left: padding,
    right: padding,
  }, maxZoom: 16 });
  const center = bottom > padding && camera?.center ? LngLat.convert(camera.center).toArray() : start;
  return { center, zoom: camera?.zoom ?? map.getZoom() };
}

export class TripFlightCamera {
  private activeId?: string;
  private origin?: CameraOptions;
  private target?: { center: MapCoordinate; zoom: number };
  private frame?: { publicationId?: string; start: MapCoordinate; zoom: number; viewport?: string };
  private completion?: Subscription;
  private returning?: Subscription;
  private previousWorldCopies?: boolean;

  constructor(private map: LibreMap, private onArrival: () => void) {}

  update(flight: MapTripFlight, scene: MapScene): MapFlightPhase {
    if (this.activeId !== flight.id) {
      this.cancel();
      if (this.returning) {
        this.returning.unsubscribe();
        this.returning = undefined;
        this.map.stop();
      }
      if (!this.activeId && flight.animate && !this.origin) {
        this.origin = {
          center: this.map.getCenter(),
          zoom: this.map.getZoom(),
          bearing: this.map.getBearing(),
          pitch: this.map.getPitch(),
        };
      }
      if (this.previousWorldCopies === undefined) {
        this.previousWorldCopies = this.map.getRenderWorldCopies();
        this.map.setRenderWorldCopies(true);
      }
      this.activeId = flight.id;
    }
    const container = this.map.getContainer();
    if (!flight.marker) {
      this.cancel();
      return 'waiting';
    }
    if (!container.clientWidth || !container.clientHeight) {
      return 'waiting';
    }
    const { lon, lat } = flight.marker.position;
    const start: MapCoordinate = [lon, lat];
    const previousStart = this.frame?.start ?? this.target?.center;
    const moved = previousStart && (previousStart[0] !== lon || previousStart[1] !== lat);
    const viewport = flight.bottomInset === undefined ? undefined : [this.map.transform.width, this.map.transform.height, flight.bottomInset].join(':');
    if (flight.ready && (!this.frame || this.frame.publicationId !== flight.publicationId || moved || this.frame.viewport !== viewport)) {
      const { center, zoom } = destination(this.map, start, scene, flight.bottomInset);
      const resized = this.frame && Math.abs(this.frame.zoom - zoom) > 0.02;
      this.frame = {
        publicationId: flight.publicationId,
        zoom,
        start,
        viewport,
      };
      if (!this.target || center[0] !== this.target.center[0] || center[1] !== this.target.center[1] || resized || zoom < this.target.zoom - 0.02 || (!this.completion && !this.atTarget(center, this.target.zoom))) {
        this.fly(center, zoom, flight.animate);
      }
    }
    else if (flight.animate && (!this.target || moved)) {
      this.fly(start, Math.max(13, Math.min(15, this.map.getZoom() + 1)), true);
    }
    if (this.completion) {
      return 'flying';
    }
    return this.frame ? 'arrived' : 'waiting';
  }

  private fly(center: MapCoordinate, zoom: number, animate: boolean) {
    const reframing = !!this.target;
    this.completion?.unsubscribe();
    this.completion = undefined;
    this.target = { center, zoom };
    const duration = animate ? motionDuration(reframing ? 480 : 740) : 0;
    if (!duration) {
      this.map.jumpTo({ center, zoom });
      return;
    }
    const request = {};
    const completion = this.map.on('moveend', (event) => {
      if (!('tripFlight' in event) || event.tripFlight !== request) {
        return;
      }
      if (!this.atTarget(center, zoom)) {
        queueMicrotask(() => {
          if (this.completion === completion) {
            this.fly(center, zoom, true);
          }
        });
        return;
      }
      completion.unsubscribe();
      this.completion = undefined;
      this.onArrival();
    });
    this.completion = completion;
    this.map.flyTo({ center, zoom, duration }, { tripFlight: request });
  }

  private atTarget(center: MapCoordinate, zoom: number): boolean {
    const target = this.map.transform.applyConstrain(LngLat.convert(center), zoom);
    if (Math.abs(this.map.getZoom() - target.zoom) > 0.01) {
      return false;
    }
    const actual = LngLat.convert(this.map.getCenter());
    const from = MercatorCoordinate.fromLngLat(actual);
    const to = MercatorCoordinate.fromLngLat(nearestWorld(target.center.toArray(), actual.lng));
    return Math.hypot(to.x - from.x, to.y - from.y) * this.map.transform.worldSize < 2;
  }

  private cancel() {
    this.completion?.unsubscribe();
    this.completion = undefined;
    if (this.target) {
      this.map.stop();
    }
    this.target = undefined;
    this.frame = undefined;
  }

  leave(): boolean {
    if (!this.activeId) {
      return false;
    }
    this.cancel();
    this.activeId = undefined;
    const origin = this.origin;
    if (!origin) {
      this.restoreWorldCopies();
      return false;
    }
    const request = {};
    this.returning = this.map.on('moveend', (event) => {
      if (!('tripReturn' in event) || event.tripReturn !== request) {
        return;
      }
      this.returning?.unsubscribe();
      this.returning = undefined;
      this.origin = undefined;
      this.restoreWorldCopies();
    });
    this.map.easeTo({ ...origin, duration: motionDuration(410) }, { tripReturn: request });
    return true;
  }

  private restoreWorldCopies() {
    if (this.previousWorldCopies !== undefined) {
      this.map.setRenderWorldCopies(this.previousWorldCopies);
    }
    this.previousWorldCopies = undefined;
  }

  destroy() {
    this.completion?.unsubscribe();
    this.completion = undefined;
    this.returning?.unsubscribe();
    this.returning = undefined;
  }
}
