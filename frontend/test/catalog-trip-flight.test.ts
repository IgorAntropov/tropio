import type {
  Map as LibreMap,
  LngLat,
  LngLatBounds,
} from 'maplibre-gl';
import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import { TripFlightCamera } from '../src/shared/map/trip-flight';
import { continuousTrack } from '../src/shared/map/world-coordinates';
import type {
  MapCoordinate,
  MapScene,
  MapTripFlight,
} from '../src/shared/map/types';

const start = { id: 'trip', position: { lon: 84.96, lat: 56.46 } };
const opening: MapTripFlight = {
  id: 'trip',
  marker: start,
  animate: true,
  ready: false,
};
const scene: MapScene = {
  mode: 'view',
  points: [start],
  pois: [],
  tracks: [{ id: 'track', coordinates: [[84.96, 56.46], [85.13, 56.5]] }],
};

function setup(reduced = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  const handlers = new Set<(event: object) => void>();
  let center: MapCoordinate = [84.7, 56.4];
  let zoom = 12;
  const map = {
    getContainer: () => ({ clientWidth: 800, clientHeight: 600 }),
    getCenter: () => center,
    getZoom: () => zoom,
    getPitch: () => 0,
    getBearing: () => 0,
    transform: {
      width: 800,
      height: 600,
      worldSize: 2097152,
      applyConstrain: (point: LngLat, level: number) => ({ center: point, zoom: level }),
    },
    cameraForBounds: vi.fn((_bounds: LngLatBounds) => ({ zoom: 11 })),
    getRenderWorldCopies: () => false,
    setRenderWorldCopies: vi.fn(),
    flyTo: vi.fn((_options: { center: MapCoordinate; zoom: number }, _event: object) => {}),
    stop: vi.fn(),
    jumpTo: vi.fn(),
    easeTo: vi.fn(),
    on: (_type: string, handler: (event: object) => void) => {
      handlers.add(handler);
      return { unsubscribe: () => handlers.delete(handler) };
    },
  };
  const onArrival = vi.fn();
  const camera = new TripFlightCamera(map as unknown as LibreMap, onArrival);
  function finish(event: object, arrived = true) {
    const flight = map.flyTo.mock.calls.find(call => call[1] === event)?.[0];
    if (arrived && flight) {
      center = flight.center;
      zoom = flight.zoom;
    }
    for (const handler of handlers) {
      handler(event);
    }
  }
  return {
    map,
    camera,
    onArrival,
    finish,
  };
}

afterEach(() => vi.unstubAllGlobals());

it('waits for the published geometry and the last flight to the marker', () => {
  const { map, camera, finish, onArrival } = setup();
  expect(camera.update(opening, scene)).toBe('flying');
  const preliminary = map.flyTo.mock.calls[0]![1];
  finish({});
  expect(onArrival).not.toHaveBeenCalled();
  const ready = { ...opening, ready: true };
  expect(camera.update(ready, scene)).toBe('flying');
  const [cameraOptions, final] = map.flyTo.mock.calls[1]!;
  expect(cameraOptions).toMatchObject({ center: [84.96, 56.46], zoom: 11 });
  finish(preliminary);
  expect(camera.update(ready, scene)).toBe('flying');
  finish(final);
  expect(camera.update(ready, scene)).toBe('arrived');
  expect(onArrival).toHaveBeenCalledOnce();
});

it('waits with only the marker if the camera arrived before the response', () => {
  const { map, camera, finish } = setup();
  camera.update(opening, scene);
  finish(map.flyTo.mock.calls[0]![1]);
  expect(camera.update(opening, scene)).toBe('waiting');
  expect(camera.update({ ...opening, marker: undefined }, scene)).toBe('waiting');
  expect(map.flyTo).toHaveBeenCalledTimes(1);
});

it('restores the original camera and ignores late arrival after cancelling', () => {
  const { map, camera, finish, onArrival } = setup();
  camera.update(opening, scene);
  const pending = map.flyTo.mock.calls[0]![1];
  expect(camera.leave()).toBe(true);
  expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [84.7, 56.4], zoom: 12 }), expect.any(Object));
  finish(pending);
  expect(onArrival).not.toHaveBeenCalled();
  expect(camera.leave()).toBe(false);
});

it('keeps the catalog camera when another trip opens during the return', () => {
  const { map, camera } = setup();
  camera.update(opening, scene);
  camera.leave();
  map.getCenter = () => [85, 57];
  camera.update({ ...opening, id: 'another' }, scene);
  camera.leave();
  expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [84.7, 56.4] }), expect.any(Object));
});

it('redirects a summary flight when the confirmed start moves and refits a larger publication', () => {
  const { map, camera, finish } = setup();
  camera.update(opening, scene);
  map.cameraForBounds.mockReturnValue({ zoom: 15 });
  const marker = { ...start, position: { lon: 82.9, lat: 55.02 } };
  const detail = {
    ...opening,
    marker,
    ready: true,
    publicationId: 'first',
  };
  expect(camera.update(detail, scene)).toBe('flying');
  const [corrected, arrived] = map.flyTo.mock.calls[1]!;
  expect(corrected).toMatchObject({ center: [82.9, 55.02], zoom: 15 });
  finish(arrived);
  expect(camera.update(detail, scene)).toBe('arrived');
  map.cameraForBounds.mockReturnValue({ zoom: 10 });
  expect(camera.update({ ...detail, publicationId: 'second' }, scene)).toBe('flying');
  expect(map.flyTo.mock.lastCall?.[0]).toMatchObject({ center: [82.9, 55.02], zoom: 10 });
});

it('continues an interrupted flight and cancels a queued retry when the trip closes', async () => {
  const { map, camera, finish, onArrival } = setup();
  const detail = { ...opening, ready: true };
  expect(camera.update(detail, scene)).toBe('flying');
  finish(map.flyTo.mock.calls[0]![1], false);
  expect(camera.update(detail, scene)).toBe('flying');
  await Promise.resolve();
  expect(map.flyTo).toHaveBeenCalledTimes(2);
  finish(map.flyTo.mock.calls[1]![1], false);
  camera.leave();
  await Promise.resolve();
  expect(map.flyTo).toHaveBeenCalledTimes(2);
  expect(onArrival).not.toHaveBeenCalled();
});

it('shows published geometry immediately on a direct link or with reduced motion', () => {
  for (const animate of [false, true]) {
    const { map, camera } = setup(animate);
    expect(camera.update({ ...opening, ready: true, animate }, scene)).toBe('arrived');
    expect(map.jumpTo).toHaveBeenCalledOnce();
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(camera.leave()).toBe(animate);
  }
});

it('frames a mobile route above the bottom controls and refits after rotation', () => {
  const { map, camera } = setup();
  const viewport = { clientWidth: 320, clientHeight: 512 };
  map.getContainer = () => viewport;
  Object.assign(map.transform, { width: 320, height: 512 });
  const center: MapCoordinate = [84.96, 56.45];
  map.cameraForBounds.mockImplementation(() => ({ center, zoom: 13 }));
  const flight = {
    ...opening,
    ready: true,
    animate: false,
    bottomInset: 78,
  };
  camera.update(flight, scene);
  expect(map.cameraForBounds).toHaveBeenLastCalledWith(expect.anything(), {
    padding: {
      top: 64,
      bottom: 100,
      left: 64,
      right: 64,
    },
    maxZoom: 16,
  });
  expect(map.jumpTo).toHaveBeenLastCalledWith({ center, zoom: 13 });
  camera.update(flight, scene);
  expect(map.cameraForBounds).toHaveBeenCalledTimes(1);
  Object.assign(viewport, { clientWidth: 568, clientHeight: 224 });
  camera.update(flight, scene);
  expect(map.cameraForBounds).toHaveBeenCalledTimes(1);
  Object.assign(map.transform, { width: 568, height: 224 });
  camera.update(flight, scene);
  expect(map.cameraForBounds).toHaveBeenLastCalledWith(expect.anything(), {
    padding: {
      top: 44,
      bottom: 100,
      left: 44,
      right: 44,
    },
    maxZoom: 16,
  });
  camera.update({ ...flight, bottomInset: 88 }, scene);
  expect(map.cameraForBounds).toHaveBeenLastCalledWith(expect.anything(), {
    padding: {
      top: 44,
      bottom: 110,
      left: 44,
      right: 44,
    },
    maxZoom: 16,
  });
});

it('frames and draws a Bering Strait crossing in the adjacent world', () => {
  const { map, camera } = setup();
  const route: MapScene = {
    mode: 'view',
    pois: [],
    points: [],
    tracks: [{ id: 'bering', coordinates: [[179.9, 67], [-179.9, 67]] }],
  };
  const marker = { id: 'chukotka', position: { lon: 179.9, lat: 67 } };
  camera.update({
    ...opening,
    id: marker.id,
    marker,
    ready: true,
    animate: false,
  }, route);
  const box = map.cameraForBounds.mock.calls[0]![0];
  expect(box.getEast() - box.getWest()).toBeCloseTo(0.4);
  expect(continuousTrack(route.tracks[0]!.coordinates)).toEqual([[179.9, 67], [180.1, 67]]);
  expect(map.setRenderWorldCopies).toHaveBeenLastCalledWith(true);
  camera.leave();
  expect(map.setRenderWorldCopies).toHaveBeenLastCalledWith(false);
});
