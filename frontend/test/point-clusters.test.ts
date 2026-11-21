import { setImmediate } from 'node:timers/promises';
import type { Map as LibreMap } from 'maplibre-gl';
import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import { PointClusters } from '../src/shared/map/point-clusters';

vi.mock('maplibre-gl', () => ({
  Marker: class {
    constructor(private options: { element: HTMLElement }) {}
    getElement() {
      return this.options.element;
    }

    setLngLat() {
      return this;
    }

    addTo() {
      return this;
    }

    remove() {}
  },
}));

const center = [84.96, 56.46] as const;
const position = { lon: center[0], lat: center[1] };
const trips = [{ id: 'first', position }, { id: 'second', position }];

function makeButton() {
  const attributes = new Map<string, string>();
  return Object.assign(new EventTarget(), {
    textContent: '',
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    getAttribute: (key: string) => attributes.get(key) ?? null,
  });
}

function group(id: number, count = 2, coordinates: readonly [number, number] = center) {
  return {
    geometry: { type: 'Point', coordinates },
    properties: { cluster_id: id, point_count: count },
  };
}

async function setup(zoom: number) {
  const createElement = vi.fn(makeButton);
  vi.stubGlobal('document', { createElement });
  const events = new EventTarget();
  const source = {
    setData: vi.fn().mockResolvedValue(undefined),
    getClusterExpansionZoom: vi.fn().mockResolvedValue(21),
    getClusterLeaves: vi.fn().mockResolvedValue([]),
  };
  const map = {
    on: events.addEventListener.bind(events),
    getSource: () => source,
    isSourceLoaded: vi.fn().mockReturnValue(true),
    getZoom: () => zoom,
    getMaxZoom: () => 20,
    easeTo: vi.fn(),
    querySourceFeatures: vi.fn().mockReturnValue([group(9)]),
  };
  const clusters = new PointClusters(map as unknown as LibreMap, {
    zoomGroup: count => `Zoom ${count}`,
    groupCount: count => `Trips ${count}`,
  }, vi.fn());
  clusters.setPoints(trips);
  await setImmediate();
  events.dispatchEvent(new Event('idle'));
  return {
    button: createElement.mock.results[0]!.value,
    createElement,
    events,
    map,
    source,
    clusters,
  };
}

afterEach(() => vi.unstubAllGlobals());

it.each([[12, 15, 15], [15, 21, 20]])('zooms from %i towards expansion %i within the map limit', async (zoom, expansion, expected) => {
  const { button, map, source } = await setup(zoom);
  expect(button.textContent).toBe('2');
  source.getClusterExpansionZoom.mockResolvedValue(expansion);
  button.dispatchEvent(new Event('click'));
  await setImmediate();
  expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center, zoom: expected }));
  expect(source.getClusterLeaves).not.toHaveBeenCalled();
});

it('keeps the trip count at maximum zoom without opening a group', async () => {
  const { button, map, source } = await setup(20);
  expect(button.textContent).toBe('2');
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(button.getAttribute('aria-label')).toBe('Trips 2');
  button.dispatchEvent(new Event('click'));
  await setImmediate();
  expect(map.easeTo).not.toHaveBeenCalled();
  expect(source.getClusterLeaves).not.toHaveBeenCalled();
});

it('ignores a late expansion zoom after the results change', async () => {
  const { button, map, source, clusters } = await setup(12);
  const pending = Promise.withResolvers<number>();
  source.getClusterExpansionZoom.mockReturnValue(pending.promise);
  button.dispatchEvent(new Event('click'));
  expect(source.getClusterExpansionZoom).toHaveBeenCalledWith(9);
  clusters.setPoints([]);
  pending.resolve(15);
  await setImmediate();
  expect(map.easeTo).not.toHaveBeenCalled();
});

it('keeps the settled snapshot until the new zoom tiles are ready', async () => {
  const { map, clusters, events } = await setup(12);
  const points = trips.map(trip => ({ geometry: { type: 'Point', coordinates: center }, properties: { id: trip.id } }));
  map.querySourceFeatures.mockReturnValue([group(9), ...points]);
  events.dispatchEvent(new Event('moveend'));
  expect(clusters.visible()).toEqual([]);
  map.querySourceFeatures.mockReturnValue(points);
  events.dispatchEvent(new Event('idle'));
  expect(clusters.visible()).toEqual(trips);
});

it('waits for the new tiles before displaying a reused cluster ID', async () => {
  const { clusters, createElement, events, map } = await setup(12);
  const nextCenter = [89, 55] as const;
  const nextPosition = { lon: nextCenter[0], lat: nextCenter[1] };
  map.isSourceLoaded.mockReturnValue(false);
  clusters.setPoints(['third', 'fourth', 'fifth'].map(id => ({ id, position: nextPosition })));
  await setImmediate();
  events.dispatchEvent(new Event('idle'));
  expect(createElement).toHaveBeenCalledTimes(1);
  expect(clusters.visible()).toEqual([]);
  map.querySourceFeatures.mockReturnValue([group(9, 3, nextCenter)]);
  map.isSourceLoaded.mockReturnValue(true);
  events.dispatchEvent(new Event('idle'));
  const replacement = createElement.mock.results.at(-1)!.value;
  expect(replacement.textContent).toBe('3');
  replacement.dispatchEvent(new Event('click'));
  await setImmediate();
  expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: nextCenter, zoom: 20 }));
});

it('honors only the latest click when two expansion requests finish out of order', async () => {
  const { clusters, createElement, events, map, source } = await setup(12);
  clusters.setPoints([...trips, { id: 'third', position }, { id: 'fourth', position }]);
  map.querySourceFeatures.mockReturnValue([group(9), group(10)]);
  await setImmediate();
  events.dispatchEvent(new Event('idle'));
  const pending = Promise.withResolvers<number>();
  source.getClusterExpansionZoom.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(17);
  const [first, second] = createElement.mock.results.slice(-2);
  first!.value.dispatchEvent(new Event('click'));
  second!.value.dispatchEvent(new Event('click'));
  await setImmediate();
  pending.resolve(15);
  await setImmediate();
  expect(map.easeTo).toHaveBeenCalledOnce();
  expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 17 }));
});
