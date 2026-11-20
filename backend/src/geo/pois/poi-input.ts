import { BffProblem } from '../../http/bff-problem.js';
import { uuid } from '../../identity/identity-input.js';

export type PoiPosition = { lon: number; lat: number };
export type PoiScope
  = | { visibility: 'global' | 'private'; scope_trip_id?: never }
    | { visibility: 'trip'; scope_trip_id: string };
export type PoiCreateInput = PoiScope & {
  category_id: string;
  name: string;
  description?: string | null;
  position: PoiPosition;
};
export interface PoiEditInput {
  poi_revision_id: string;
  category_id?: string;
  name?: string;
  description?: string | null;
  position?: PoiPosition;
}
export type PoiVisibilityInput = PoiScope & { poi_revision_id: string };
export interface PoiRemoveInput { poi_revision_id: string }
export interface PoiModerationInput {
  poi_revision_id: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}
export interface PoiListInput {
  scope: 'global' | 'mine' | 'trip';
  trip_id?: string;
  bbox?: [number, number, number, number];
  q?: string;
  cursor?: string;
  limit: number;
}

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== 'string' || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) {
    throw new BffProblem('INVALID_REQUEST');
  }
  const trimmed = value.trim();
  const length = [...trimmed].length;
  if (length < minimum || length > maximum) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return trimmed;
}

function description(value: unknown): string | null {
  return value === null ? null : text(value, 0, 4000) || null;
}

function normalizedUuid(value: unknown): string {
  return uuid(value).toLowerCase();
}

function coordinate(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > maximum) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return value;
}

function position(value: unknown): PoiPosition {
  const input = object(value, ['lon', 'lat']);
  return { lon: coordinate(input.lon, 180), lat: coordinate(input.lat, 90) };
}

function visibility(input: Record<string, unknown>): PoiScope {
  if (input.visibility === 'trip') {
    return { visibility: 'trip', scope_trip_id: normalizedUuid(input.scope_trip_id) };
  }
  if ((input.visibility === 'global' || input.visibility === 'private') && !Object.hasOwn(input, 'scope_trip_id')) {
    return { visibility: input.visibility };
  }
  throw new BffProblem('INVALID_REQUEST');
}

export function poiCreateInput(value: unknown): PoiCreateInput {
  const input = object(value, ['category_id', 'name', 'description', 'position', 'visibility', 'scope_trip_id']);
  return {
    category_id: normalizedUuid(input.category_id),
    name: text(input.name, 1, 120),
    ...(Object.hasOwn(input, 'description') ? { description: description(input.description) } : {}),
    position: position(input.position),
    ...visibility(input),
  };
}

export function poiEditInput(value: unknown): PoiEditInput {
  const input = object(value, ['poi_revision_id', 'category_id', 'name', 'description', 'position']);
  if (Object.keys(input).length < 2) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return {
    poi_revision_id: normalizedUuid(input.poi_revision_id),
    ...(Object.hasOwn(input, 'category_id') ? { category_id: normalizedUuid(input.category_id) } : {}),
    ...(Object.hasOwn(input, 'name') ? { name: text(input.name, 1, 120) } : {}),
    ...(Object.hasOwn(input, 'description') ? { description: description(input.description) } : {}),
    ...(Object.hasOwn(input, 'position') ? { position: position(input.position) } : {}),
  };
}

export function poiVisibilityInput(value: unknown): PoiVisibilityInput {
  const input = object(value, ['poi_revision_id', 'visibility', 'scope_trip_id']);
  return { poi_revision_id: normalizedUuid(input.poi_revision_id), ...visibility(input) };
}

export function poiRemoveInput(value: unknown): PoiRemoveInput {
  return { poi_revision_id: normalizedUuid(object(value, ['poi_revision_id']).poi_revision_id) };
}

export function poiModerationInput(value: unknown): PoiModerationInput {
  const input = object(value, ['poi_revision_id', 'decision', 'reason']);
  if (input.decision !== 'approved' && input.decision !== 'rejected') {
    throw new BffProblem('INVALID_REQUEST');
  }
  return {
    poi_revision_id: normalizedUuid(input.poi_revision_id),
    decision: input.decision,
    ...(Object.hasOwn(input, 'reason') ? { reason: text(input.reason, 1, 1000) } : {}),
  };
}

function bbox(value: unknown): [number, number, number, number] {
  if (typeof value !== 'string') {
    throw new BffProblem('INVALID_REQUEST');
  }
  const parts = value.split(',');
  if (parts.length !== 4 || parts.some(part => !/^-?\d+(?:\.\d+)?$/.test(part))) {
    throw new BffProblem('INVALID_REQUEST');
  }
  const west = coordinate(Number(parts[0]), 180);
  const south = coordinate(Number(parts[1]), 90);
  const east = coordinate(Number(parts[2]), 180);
  const north = coordinate(Number(parts[3]), 90);
  if (west >= east || south >= north) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return [west, south, east, north];
}

export function poiListInput(value: unknown): PoiListInput {
  const input = object(value, ['scope', 'trip_id', 'bbox', 'q', 'cursor', 'limit']);
  const { scope, limit = '30', cursor } = input;
  if (scope !== 'global' && scope !== 'mine' && scope !== 'trip') {
    throw new BffProblem('INVALID_REQUEST');
  }
  if ((scope === 'trip') !== Object.hasOwn(input, 'trip_id')) {
    throw new BffProblem('INVALID_REQUEST');
  }
  if (typeof limit !== 'string' || !/^(?:[1-9][0-9]?|100)$/.test(limit)) {
    throw new BffProblem('INVALID_REQUEST');
  }
  if (cursor !== undefined && (typeof cursor !== 'string' || !/^[\w-]{1,1024}$/.test(cursor))) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return {
    scope,
    ...(scope === 'trip' ? { trip_id: normalizedUuid(input.trip_id) } : {}),
    ...(Object.hasOwn(input, 'bbox') ? { bbox: bbox(input.bbox) } : {}),
    ...(Object.hasOwn(input, 'q') ? { q: text(input.q, 2, 100) } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    limit: Number(limit),
  };
}
