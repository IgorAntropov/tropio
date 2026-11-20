import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { BffProblem } from '../../http/bff-problem.js'
import type { GeoLine, GeoProviders, LonLat } from '../providers/index.js'
import type { TrackInput } from './route-input.js'
import { lineDistance, lineGeoJsonSql, pointWkt } from './route-store.js'
import type { RoutePoint, RouteTrack, Snapshot, Surface } from './route-store.js'

type RouteProviders = Pick<GeoProviders, 'preview' | 'elevation'>

export function samePosition(first: LonLat, second: LonLat): boolean {
  return Math.abs(first.lon - second.lon) < 1e-10 && Math.abs(first.lat - second.lat) < 1e-10
}

function coordinate({ lon, lat }: LonLat): [number, number] {
  return [lon, lat]
}

function position(value: number[] | undefined): LonLat {
  const [lon, lat] = value ?? []
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180
    || typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new BffProblem('DEPENDENCY_UNAVAILABLE')
  }
  return { lon, lat }
}

function requested(point: RoutePoint): LonLat {
  return point.requested_position ?? point.position
}

function matchingGeometry(line: GeoLine, from: LonLat, to: LonLat): boolean {
  return line.length >= 2 && samePosition(from, position(line[0])) && samePosition(to, position(line.at(-1)))
}

function exactEndpoints(line: GeoLine, from: LonLat, to: LonLat): GeoLine {
  return [coordinate(from), ...line.slice(1, -1), coordinate(to)]
}

function previousShape(old: RouteTrack, first: RoutePoint, last: RoutePoint, previous: RoutePoint[]): boolean {
  const oldFirst = previous.find(point => point.point_id === first.point_id)
  const oldLast = previous.find(point => point.point_id === last.point_id)
  return old.status === 'ready' && old.start_point_id === first.point_id && old.end_point_id === last.point_id
    && !!oldFirst && !!oldLast && samePosition(requested(oldFirst), requested(first))
    && samePosition(requested(oldLast), requested(last))
    && matchingGeometry(old.geometry.coordinates, oldFirst.position, oldLast.position)
}

interface Candidate {
  line: GeoLine
  provider: string | null
  version: string | null
  duration: number | null
  retained: boolean
}

interface TrackPlan {
  first: RoutePoint
  last: RoutePoint
  input: TrackInput
  old?: RouteTrack
  candidate?: Candidate
}

async function prepareAutomatic(providers: RouteProviders, plan: TrackPlan, previous: Snapshot): Promise<Candidate | undefined> {
  const { input, first, last, old } = plan
  if (old && input.build_mode === old.build_mode && input.transport_mode === old.transport_mode
    && previousShape(old, first, last, previous.points)) {
    return {
      line: old.geometry.coordinates, provider: old.routing_provider ?? null,
      version: old.route_source_version ?? null, duration: old.estimated_duration_s ?? null, retained: true,
    }
  }

  const preview = await providers.preview({
    from: requested(first), to: requested(last), build_mode: 'automatic', transport_mode: input.transport_mode,
  })
  if (preview.status !== 'available' || !preview.geometry || preview.geometry.length < 2
    || !preview.provider || !preview.graph_version) {
    if (old) return
    throw new BffProblem('ROUTE_BUILD_UNAVAILABLE')
  }

  const from = position(preview.geometry[0])
  const to = position(preview.geometry.at(-1))
  const confirmation = input.confirm_snap
  if (confirmation ? confirmation.graph_version !== preview.graph_version
    || !samePosition(from, confirmation.from) || !samePosition(to, confirmation.to)
    : !samePosition(from, requested(first)) || !samePosition(to, requested(last))) {
    throw new BffProblem('SNAP_CONFIRMATION_REQUIRED')
  }
  return {
    line: preview.geometry, provider: preview.provider,
    version: preview.graph_version, duration: preview.duration_s, retained: false,
  }
}

function reconcile(plan: TrackPlan, waypointPositions: Map<string, LonLat>) {
  const { candidate, first, last, old } = plan
  if (!candidate) return
  const from = position(candidate.line[0])
  const to = position(candidate.line.at(-1))
  const previousFrom = waypointPositions.get(first.point_id)
  const previousTo = waypointPositions.get(last.point_id)
  if ((previousFrom && !samePosition(previousFrom, from)) || (previousTo && !samePosition(previousTo, to))) {
    if (!old) throw new BffProblem('ROUTE_BUILD_UNAVAILABLE')
    plan.candidate = undefined
    return
  }
  waypointPositions.set(first.point_id, previousFrom ?? from)
  waypointPositions.set(last.point_id, previousTo ?? to)
}

function applyWaypointPosition(point: RoutePoint, proposed: LonLat | undefined): void {
  const original = requested(point)
  point.position = proposed ?? original
  if (!samePosition(point.position, original)) {
    point.requested_position = original
    point.snapped_position = point.position
  } else {
    point.requested_position = undefined
    point.snapped_position = undefined
  }
}

async function elevationValues(providers: RouteProviders, geometry: GeoLine, enabled: boolean) {
  const elevation = enabled ? await providers.elevation(geometry) : null
  return {
    ascent_m: elevation?.ascent_m ?? null,
    descent_m: elevation?.descent_m ?? null,
    min_elevation_m: elevation?.min_elevation_m ?? null,
    max_elevation_m: elevation?.max_elevation_m ?? null,
    elevation_profile: elevation,
  }
}

function editedText(value: string | undefined, previous: string | undefined): string | undefined {
  return value === undefined ? previous : value || undefined
}

export function updatePointText(point: RoutePoint, edit: { name?: string; description?: string }) {
  point.name = editedText(edit.name, point.name)
  point.description = editedText(edit.description, point.description)
}

export async function buildRouteTracks(providers: RouteProviders, points: RoutePoint[], tracks: TrackInput[], previous: Snapshot) {
  const plans = tracks.map((input, index): TrackPlan => {
    const first = points[index]
    const last = points[index + 1]
    if (!first || !last) throw new BffProblem('INVALID_ROUTE_TOPOLOGY')
    const old = input.track_id ? previous.tracks.find(track => track.track_id === input.track_id) : undefined
    if (input.track_id && !old) throw new BffProblem('INVALID_ROUTE_TOPOLOGY')
    return { first, last, input, old }
  })

  for (const plan of plans) {
    if (plan.input.build_mode === 'automatic') plan.candidate = await prepareAutomatic(providers, plan, previous)
  }
  const waypointPositions = new Map<string, LonLat>()
  for (const plan of plans.filter(plan => plan.candidate?.retained)) reconcile(plan, waypointPositions)
  for (const plan of plans.filter(plan => !plan.candidate?.retained)) reconcile(plan, waypointPositions)
  for (const point of points) applyWaypointPosition(point, waypointPositions.get(point.point_id))

  const result: RouteTrack[] = []
  const retainedTrackIds = new Set<string>()
  for (const { input, first, last, old, candidate } of plans) {
    if (samePosition(first.position, last.position)) throw new BffProblem('INVALID_ROUTE_TOPOLOGY')
    const retained = old && (candidate?.retained || (input.build_mode === 'straight' && old.build_mode === 'straight'
      && input.transport_mode === old.transport_mode && old.status === 'ready'
      && first.point_id === old.start_point_id && last.point_id === old.end_point_id
      && matchingGeometry(old.geometry.coordinates, first.position, last.position)))
    if (retained) {
      retainedTrackIds.add(old.track_id)
      result.push({ ...old, name: editedText(input.name, old.name), description: editedText(input.description, old.description) })
      continue
    }
    const line = candidate
      ? exactEndpoints(candidate.line, first.position, last.position)
      : [coordinate(first.position), coordinate(last.position)]
    const ready = input.build_mode === 'straight' || !!candidate
    const track: RouteTrack = {
      ...old,
      track_id: old?.track_id ?? randomUUID(),
      start_point_id: first.point_id,
      end_point_id: last.point_id,
      geometry: { type: 'LineString', coordinates: line },
      status: ready ? 'ready' : 'needs_rebuild',
      build_mode: input.build_mode,
      transport_mode: input.transport_mode,
      distance_m: 0,
      estimated_duration_s: candidate?.duration == null ? null : Math.round(candidate.duration),
      routing_provider: candidate?.provider ?? null,
      route_source_version: candidate?.version ?? null,
      name: editedText(input.name, old?.name),
      description: editedText(input.description, old?.description),
      ...await elevationValues(providers, line, ready),
    }
    result.push(track)
  }

  return {
    tracks: result,
    surfaces: previous.surfaces.filter(surface => retainedTrackIds.has(surface.track_id)),
  }
}

export async function finalizeDistances(client: PoolClient, tracks: RouteTrack[]): Promise<void> {
  for (const track of tracks) {
    if (track.distance_m >= 0.1) continue
    track.distance_m = await lineDistance(client, track.geometry.coordinates)
    if (track.distance_m < 0.1) throw new BffProblem('INVALID_ROUTE_TOPOLOGY')
  }
}

export interface Cut {
  fraction: number
  left: { type: 'LineString'; coordinates: GeoLine }
  right: { type: 'LineString'; coordinates: GeoLine }
}

export async function cutTrack(client: PoolClient, routeId: string, version: string, trackId: string, point: LonLat): Promise<Cut> {
  const { rows: [cut] } = await client.query<Cut>(
    `WITH positions AS (
       SELECT geom::public.geography AS line, $4::public.geography AS point
       FROM geo.tracks WHERE route_id = $1 AND route_version = $2 AND track_id = $3 AND status = 'ready'
     ), located AS (
       SELECT line, public.ST_LineLocatePoint(line, point) AS fraction
       FROM positions WHERE public.ST_Distance(line, point) <= 25
     ), pieces AS (
       SELECT fraction, public.ST_LineSubstring(line, 0, fraction) AS first_part,
         public.ST_LineSubstring(line, fraction, 1) AS second_part
       FROM located WHERE fraction > 0 AND fraction < 1
     )
     SELECT fraction, ${lineGeoJsonSql('first_part::public.geometry')} AS "left",
       ${lineGeoJsonSql('second_part::public.geometry')} AS "right"
     FROM pieces WHERE public.ST_Length(first_part) >= 1 AND public.ST_Length(second_part) >= 1`,
    [routeId, version, trackId, pointWkt(point)],
  )
  if (!cut || cut.left.coordinates.length < 2 || cut.right.coordinates.length < 2) {
    throw new BffProblem('INVALID_SPLIT_POSITION')
  }
  return cut
}

function dividedSurfaces(surfaces: Surface[], sourceId: string, leftId: string, rightId: string, at: number) {
  const untouched = surfaces.filter(surface => surface.track_id !== sourceId)
  const sections = surfaces.filter(surface => surface.track_id === sourceId)
  const left = sections.filter(surface => surface.from_fraction < at).map((surface, position) => ({
    ...surface, position, track_id: leftId,
    from_fraction: surface.from_fraction / at,
    to_fraction: Math.min(1, surface.to_fraction / at),
  }))
  const right = sections.filter(surface => surface.to_fraction > at).map((surface, position) => ({
    ...surface, position, track_id: rightId,
    from_fraction: Math.max(0, (surface.from_fraction - at) / (1 - at)),
    to_fraction: (surface.to_fraction - at) / (1 - at),
  }))
  return [...untouched, ...left, ...right]
}

export async function splitSnapshot(providers: RouteProviders, snapshot: Snapshot, trackId: string, cut: Cut) {
  const index = snapshot.tracks.findIndex(track => track.track_id === trackId)
  const original = snapshot.tracks[index]
  const start = snapshot.points[index]
  const finish = snapshot.points[index + 1]
  if (!original || !start || !finish) throw new BffProblem('NOT_FOUND')
  if (original.start_point_id !== start.point_id || original.end_point_id !== finish.point_id) {
    throw new BffProblem('INVALID_SPLIT_POSITION')
  }

  const midpoint = position(cut.left.coordinates.at(-1))
  const point = { point_id: randomUUID(), position: midpoint }
  const leftId = randomUUID()
  const rightId = randomUUID()
  const duration = original.estimated_duration_s
  const leftDuration = duration == null ? null : Math.round(duration * cut.fraction)
  const rightDuration = duration == null || leftDuration == null ? null : duration - leftDuration
  const left = exactEndpoints(cut.left.coordinates, start.position, midpoint)
  const right = exactEndpoints(cut.right.coordinates, midpoint, finish.position)
  snapshot.points.splice(index + 1, 0, point)
  snapshot.tracks.splice(index, 1, {
    ...original, track_id: leftId, end_point_id: point.point_id, distance_m: 0,
    geometry: { type: 'LineString', coordinates: left },
    estimated_duration_s: leftDuration, ...await elevationValues(providers, left, true),
  }, {
    ...original, track_id: rightId, start_point_id: point.point_id, distance_m: 0,
    geometry: { type: 'LineString', coordinates: right },
    estimated_duration_s: rightDuration, ...await elevationValues(providers, right, true),
  })
  snapshot.surfaces = dividedSurfaces(snapshot.surfaces, trackId, leftId, rightId, cut.fraction)
  return { point_id: point.point_id, track_ids: [leftId, rightId] }
}
