import { BffProblem } from '../../http/bff-problem.js';
import { uuid } from '../../identity/identity-input.js';
import type {
  LonLat,
  TransportMode,
} from '../providers/index.js';

export type BuildMode = 'automatic' | 'straight';

export interface PointInput {
  point_id?: string;
  position: LonLat;
  poi_id?: string;
  name?: string;
  description?: string;
}

export interface TrackInput {
  track_id?: string;
  build_mode: BuildMode;
  transport_mode: TransportMode;
  confirm_snap?: { from: LonLat; to: LonLat; graph_version: string };
  name?: string;
  description?: string;
}

function object(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !keys.includes(key))) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return input as Record<string, unknown>;
}

export function routeUuid(value: unknown): string {
  return uuid(value).toLowerCase();
}

function optionalId(value: unknown): string | undefined {
  return value === undefined ? undefined : routeUuid(value);
}

function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || Array.from(value).length > max
    || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return value.trim();
}

export function routePosition(value: unknown): LonLat {
  const { lon, lat } = object(value, ['lon', 'lat']);
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180
    || typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return { lon, lat };
}

function point(value: unknown): PointInput {
  const body = object(value, ['point_id', 'position', 'poi_id', 'name', 'description']);
  return {
    point_id: optionalId(body.point_id),
    position: routePosition(body.position),
    poi_id: optionalId(body.poi_id),
    name: optionalText(body.name, 120),
    description: optionalText(body.description, 4000),
  };
}

function track(value: unknown): TrackInput {
  const body = object(value, ['track_id', 'build_mode', 'transport_mode', 'name', 'description', 'confirm_snap']);
  if ((body.build_mode !== 'automatic' && body.build_mode !== 'straight')
    || (body.transport_mode !== 'car' && body.transport_mode !== 'bicycle' && body.transport_mode !== 'foot')) {
    throw new BffProblem('INVALID_REQUEST');
  }
  const confirmation = body.confirm_snap === undefined ? undefined : snapConfirmation(body.confirm_snap);
  if (confirmation && body.build_mode !== 'automatic') {
    throw new BffProblem('INVALID_REQUEST');
  }
  return {
    track_id: optionalId(body.track_id),
    build_mode: body.build_mode,
    transport_mode: body.transport_mode,
    name: optionalText(body.name, 120),
    description: optionalText(body.description, 4000),
    confirm_snap: confirmation,
  };
}

function snapConfirmation(value: unknown): NonNullable<TrackInput['confirm_snap']> {
  const { from, to, graph_version } = object(value, ['from', 'to', 'graph_version']);
  if (typeof graph_version !== 'string' || !graph_version || graph_version.length > 256) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return { from: routePosition(from), to: routePosition(to), graph_version };
}

function uniqueIds(ids: Array<string | undefined>): boolean {
  const existing = ids.filter(id => id !== undefined);
  return new Set(existing).size === existing.length;
}

function nullableRevision(value: unknown): string | null {
  return value === null ? null : routeUuid(value);
}

export function routeEdit(input: unknown) {
  const body = object(input, ['route_revision_id', 'points', 'tracks']);
  if (!Array.isArray(body.points) || !Array.isArray(body.tracks)) {
    throw new BffProblem('INVALID_REQUEST');
  }

  const points = body.points.map(point);
  const tracks = body.tracks.map(track);
  if (tracks.length !== Math.max(0, points.length - 1)
    || !uniqueIds(points.map(({ point_id }) => point_id))
    || !uniqueIds(tracks.map(({ track_id }) => track_id))) {
    throw new BffProblem('INVALID_ROUTE_TOPOLOGY');
  }

  return { route_revision_id: nullableRevision(body.route_revision_id), points, tracks };
}

export function routeSplit(input: unknown) {
  const body = object(input, ['route_id', 'route_revision_id', 'split_position']);
  return {
    route_id: routeUuid(body.route_id),
    route_revision_id: routeUuid(body.route_revision_id),
    split_position: routePosition(body.split_position),
  };
}

export function routeRestore(input: unknown) {
  const body = object(input, ['route_revision_id', 'target_revision_id']);
  return { route_revision_id: nullableRevision(body.route_revision_id), target_revision_id: routeUuid(body.target_revision_id) };
}
