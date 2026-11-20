import {
  describe,
  expect,
  it,
} from 'vitest';
import type {
  Elevation,
  Preview,
  PreviewRequest,
} from '../src/geo/providers/index.js';
import { buildRouteTracks } from '../src/geo/routes/route-geometry.js';
import {
  routeEdit,
  routeSplit,
} from '../src/geo/routes/route-input.js';
import type { TrackInput } from '../src/geo/routes/route-input.js';
import type { Snapshot } from '../src/geo/routes/route-store.js';

const id = '41414141-2222-4333-8444-555555555555';

describe('route write inputs', () => {
  it('allows an uninitialized route with mixed implicit edges and validates order by length', () => {
    const points = [
      { position: { lon: 84, lat: 56 } },
      { position: { lon: 84.02, lat: 56.01 } },
      { position: { lon: 84.04, lat: 56.02 } },
    ];
    const tracks = [
      { build_mode: 'automatic', transport_mode: 'car', confirm_snap: {
        from: points[0]!.position,
        to: points[1]!.position,
        graph_version: 'local',
      } },
      { build_mode: 'straight', transport_mode: 'foot' },
    ];
    expect(routeEdit({ route_revision_id: null, points, tracks })).toMatchObject({ points, tracks });
    expect(() => routeEdit({ route_revision_id: null, points, tracks: tracks.slice(0, 1) }))
      .toThrow('INVALID_ROUTE_TOPOLOGY');
  });

  it('rejects injected geometry and non-canonical schema state', () => {
    expect(() => routeEdit({ route_revision_id: null, points: [{ position: { lat: 99, lon: 2 } }], tracks: [] }))
      .toThrow('INVALID_REQUEST');
    expect(() => routeEdit({
      route_revision_id: null,
      points: [{ position: { lon: 1, lat: 2 } }, { position: { lon: 2, lat: 3 } }],
      tracks: [{ build_mode: 'automatic', transport_mode: 'car', geometry: {} }],
    })).toThrow('INVALID_REQUEST');
  });

  it('accepts bounded split coordinates and canonical route identities', () => {
    expect(routeSplit({ route_id: id.toUpperCase(), route_revision_id: id, split_position: { lat: 56.433, lon: 84.778 } }))
      .toEqual({ route_id: id, route_revision_id: id, split_position: { lat: 56.433, lon: 84.778 } });
  });
});

function preview({ from, to }: PreviewRequest, ready: boolean): Preview {
  return {
    status: ready ? 'available' : 'unavailable',
    from: { requested: from, snapped: null, distance_m: null },
    to: { requested: to, snapped: null, distance_m: null },
    geometry: ready ? [[from.lon, from.lat], [to.lon, to.lat]] : null,
    provider: ready ? 'valhalla' : null,
    graph_version: ready ? 'local' : null,
    distance_m: null,
    duration_s: null,
    alternatives: [],
  };
}

async function elevation(): Promise<Elevation> {
  return {
    ascent_m: null,
    descent_m: null,
    min_elevation_m: null,
    max_elevation_m: null,
    profile: [],
    source: null,
    version: null,
    covered_distance_m: 0,
    vertical_datum: null,
    method: null,
  };
}

describe('route waypoint movement', () => {
  it('retains shared topology and removes stale automatic geometry when rebuilding is unavailable', async () => {
    const points = [
      { point_id: 'start', position: { lon: 84, lat: 56 } },
      { point_id: 'waypoint', position: { lon: 84.02, lat: 56.01 } },
      { point_id: 'finish', position: { lon: 84.04, lat: 56.02 } },
    ];
    const inputs: TrackInput[] = [
      { build_mode: 'automatic', transport_mode: 'car' },
      { build_mode: 'straight', transport_mode: 'foot' },
    ];
    const empty: Snapshot = {
      points: [],
      tracks: [],
      surfaces: [],
      dependencies: [],
    };
    const previous = await buildRouteTracks({ preview: async request => preview(request, true), elevation },
      points, inputs, empty);
    const moved = [points[0]!, { point_id: 'waypoint', position: { lon: 84.03, lat: 56.02 } }, points[2]!];
    const persisted = inputs.map((input, index) => ({ ...input, track_id: previous.tracks[index]?.track_id }));
    const result = await buildRouteTracks({ preview: async request => preview(request, false), elevation },
      moved, persisted, { ...empty, ...previous, points });

    expect(result.tracks).toMatchObject([
      { status: 'needs_rebuild', end_point_id: 'waypoint', geometry: { coordinates: [[84, 56], [84.03, 56.02]] } },
      { status: 'ready', start_point_id: 'waypoint', geometry: { coordinates: [[84.03, 56.02], [84.04, 56.02]] } },
    ]);
    expect(previous.tracks[0]?.geometry.coordinates.at(-1)).toEqual([84.02, 56.01]);
  });
});
