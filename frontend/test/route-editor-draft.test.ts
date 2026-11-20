import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  addPoint,
  draftType,
  movePoint,
  removePoint,
  toReplaceCommand,
} from '../src/features/edit-route/route-draft';
import type { WorkingRoute } from '../src/features/edit-route/route-draft';

const A = { lon: 84.95, lat: 56.48 };
const B = { lon: 84.96, lat: 56.49 };
const C = { lon: 84.97, lat: 56.50 };

describe('route editor working draft', () => {
  it('keeps the first point local and sends an ordered mixed route with no local identifier', () => {
    const empty: WorkingRoute = { points: [], tracks: [] };
    const first = addPoint(empty, A, 'a', 'unused', 'automatic', 'car');
    expect(first.tracks).toHaveLength(0);
    const second = addPoint(first, B, 'b', 'ab', 'automatic', 'car');
    const mixed = addPoint(second, C, 'c', 'bc', 'straight', 'foot');
    expect(draftType(mixed)).toBe('combined');
    expect(toReplaceCommand(mixed, null)).toEqual({
      route_revision_id: null,
      points: [{ position: A }, { position: B }, { position: C }],
      tracks: [{ build_mode: 'automatic', transport_mode: 'car' }, { build_mode: 'straight', transport_mode: 'foot' }],
    });
  });

  it('updates both neighboring provisional lines without altering the original snapshot', () => {
    const route = addPoint(addPoint(addPoint({ points: [], tracks: [] }, A, 'a', '', 'straight', 'foot'),
      B, 'b', 'ab', 'straight', 'foot'), C, 'c', 'bc', 'straight', 'foot');
    const next = { lon: 84.955, lat: 56.495 };
    const moved = movePoint(route, 'b', next);
    expect(route.points[1]?.position).toEqual(B);
    expect(moved.tracks[0]?.coordinates.at(-1)).toEqual([next.lon, next.lat]);
    expect(moved.tracks[1]?.coordinates[0]).toEqual([next.lon, next.lat]);
    expect(removePoint(moved, 'b', 'ac').tracks).toMatchObject([{ track_id: 'ac', start_point_id: 'a', end_point_id: 'c' }]);
  });
});
