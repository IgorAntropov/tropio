import type { MapCoordinate } from './types';

export function nearestWorld(position: MapCoordinate, longitude: number): MapCoordinate {
  if (Math.abs(position[0] - longitude) <= 180) {
    return position;
  }
  return [position[0] + 360 * Math.round((longitude - position[0]) / 360), position[1]];
}

export function continuousTrack(positions: MapCoordinate[]): MapCoordinate[] {
  let previous = positions[0]?.[0] ?? 0;
  let unwrapped: MapCoordinate[] | undefined;
  for (const [index, position] of positions.entries()) {
    const next = nearestWorld(position, previous);
    if (!unwrapped && next !== position) {
      unwrapped = positions.slice(0, index);
    }
    unwrapped?.push(next);
    previous = next[0];
  }
  return unwrapped ?? positions;
}
