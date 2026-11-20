import type { Position, ReadableRouteDraft, ReplaceRouteDraft, RouteTrackInput, RouteTrackPreview } from '@fsd/shared/api'

export type BuildMode = RouteTrackInput['build_mode']
export type TransportMode = RouteTrackInput['transport_mode']
export type Coordinates = [number, number][]
export type WorkingPoint = {
  point_id: string
  position: Position
  requested_position?: Position
  name?: string
  description?: string
  poi_id?: string
}
export type WorkingTrack = {
  track_id: string
  start_point_id: string
  end_point_id: string
  transport_mode: TransportMode
  build_mode: BuildMode
  coordinates: Coordinates
  status?: 'ready' | 'needs_rebuild'
  distance_m?: number
  name?: string
  description?: string
  confirm_snap?: RouteTrackInput['confirm_snap']
}
export type WorkingRoute = { points: WorkingPoint[]; tracks: WorkingTrack[] }
export type TrackPatch = Pick<WorkingTrack, 'build_mode' | 'transport_mode' | 'name' | 'description'>

export const emptyRoute: WorkingRoute = { points: [], tracks: [] }

export function samePosition(first: Position, second: Position) {
  return Math.abs(first.lon - second.lon) < 1e-10 && Math.abs(first.lat - second.lat) < 1e-10
}

function line(start: Position, finish: Position): Coordinates {
  return [[start.lon, start.lat], [finish.lon, finish.lat]]
}

function provisionalTrack(id: string, from: WorkingPoint, to: WorkingPoint, build_mode: BuildMode, transport_mode: TransportMode): WorkingTrack {
  return {
    track_id: id,
    start_point_id: from.point_id,
    end_point_id: to.point_id,
    build_mode,
    transport_mode,
    coordinates: line(from.position, to.position),
  }
}

export function addPoint(route: WorkingRoute, position: Position, id: string, trackId: string,
  buildMode: BuildMode, transportMode: TransportMode): WorkingRoute {
  const point = { point_id: id, position }
  const previous = route.points.at(-1)
  return {
    points: [...route.points, point],
    tracks: previous ? [...route.tracks, provisionalTrack(trackId, previous, point, buildMode, transportMode)] : [],
  }
}

export function movePoint(route: WorkingRoute, pointId: string, position: Position): WorkingRoute {
  const index = route.points.findIndex(point => point.point_id === pointId)
  const point = route.points[index]
  if (!point || samePosition(point.position, position)) return route
  const points = route.points.map((item, order) => order === index
    ? { ...item, position, requested_position: undefined, poi_id: undefined } : item)
  const tracks = route.tracks.map((track, order) => order === index - 1 || order === index
    ? { ...track, coordinates: line(points[order]!.position, points[order + 1]!.position), status: undefined,
        distance_m: undefined, confirm_snap: undefined } : track)
  return { points, tracks }
}

export function removePoint(route: WorkingRoute, pointId: string, trackId: string): WorkingRoute {
  const index = route.points.findIndex(point => point.point_id === pointId)
  if (index < 0) return route
  const points = route.points.filter(point => point.point_id !== pointId)
  if (index === 0) return { points, tracks: route.tracks.slice(1) }
  if (index === route.points.length - 1) return { points, tracks: route.tracks.slice(0, -1) }
  const previous = route.tracks[index - 1]!
  const joint = provisionalTrack(trackId, points[index - 1]!, points[index]!, previous.build_mode, previous.transport_mode)
  return { points, tracks: [...route.tracks.slice(0, index - 1), joint, ...route.tracks.slice(index + 1)] }
}

export function updateTrack(route: WorkingRoute, trackId: string, patch: TrackPatch): WorkingRoute {
  const tracks = route.tracks.map((track, index) => {
    if (track.track_id !== trackId) return track
    const changed = track.build_mode !== patch.build_mode || track.transport_mode !== patch.transport_mode
    return {
      ...track, ...patch,
      ...(changed ? { coordinates: line(route.points[index]!.position, route.points[index + 1]!.position),
        status: undefined, distance_m: undefined, confirm_snap: undefined } : {}),
    }
  })
  return { ...route, tracks }
}

export function fromServer(route: ReadableRouteDraft): WorkingRoute {
  return {
    points: route.points.map(point => ({ ...point })),
    tracks: route.tracks.map(track => ({ ...track, coordinates: track.geometry.coordinates as Coordinates })),
  }
}

export function draftType(route: WorkingRoute): TransportMode | 'combined' | null {
  const modes = new Set(route.tracks.map(track => track.transport_mode))
  return modes.size > 1 ? 'combined' : modes.values().next().value ?? null
}

export function toReplaceCommand(route: WorkingRoute, saved: ReadableRouteDraft | null): ReplaceRouteDraft {
  const pointIds = new Set(saved?.points.map(point => point.point_id))
  const trackIds = new Set(saved?.tracks.map(track => track.track_id))
  return {
    route_revision_id: saved?.route_revision_id ?? null,
    points: route.points.map(point => ({
      ...(pointIds.has(point.point_id) ? { point_id: point.point_id } : {}),
      position: point.position,
      ...(point.name === undefined ? {} : { name: point.name }),
      ...(point.description === undefined ? {} : { description: point.description }),
      ...(point.poi_id ? { poi_id: point.poi_id } : {}),
    })),
    tracks: route.tracks.map(track => ({
      ...(trackIds.has(track.track_id) ? { track_id: track.track_id } : {}),
      build_mode: track.build_mode,
      transport_mode: track.transport_mode,
      ...(track.name === undefined ? {} : { name: track.name }),
      ...(track.description === undefined ? {} : { description: track.description }),
      ...(track.confirm_snap ? { confirm_snap: track.confirm_snap } : {}),
    })),
  }
}

export function applyPreview(route: WorkingRoute, index: number, preview: RouteTrackPreview): WorkingRoute {
  const { from, to, graph_version, geometry, distance_m } = preview
  const tracks = [...route.tracks]
  const track = tracks[index]
  if (!track || !geometry || !from.snapped || !to.snapped || !graph_version) return route
  tracks[index] = {
    ...track,
    coordinates: geometry as Coordinates,
    distance_m: distance_m ?? undefined,
    confirm_snap: { from: from.snapped, to: to.snapped, graph_version },
  }
  return { ...route, tracks }
}
