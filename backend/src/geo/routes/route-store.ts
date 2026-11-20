import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { GeoLine, GeoProviders, LonLat, TransportMode } from '../providers/index.js'
import type { BuildMode } from './route-input.js'

export type Elevation = Awaited<ReturnType<GeoProviders['elevation']>>

type Schedule = {
  schedule_start_date?: string | null
  schedule_end_date?: string | null
  schedule_start_time?: string | null
  schedule_end_time?: string | null
  schedule_timezone?: string | null
}

export interface RoutePoint extends Schedule {
  point_id: string
  position: LonLat
  requested_position?: LonLat
  snapped_position?: LonLat
  poi_id?: string
  name?: string
  description?: string
}

export interface RouteTrack extends Schedule {
  track_id: string
  start_point_id: string
  end_point_id: string
  geometry: { type: 'LineString'; coordinates: GeoLine }
  build_mode: BuildMode
  transport_mode: TransportMode
  status: 'ready' | 'needs_rebuild'
  distance_m: number
  ascent_m: number | null
  descent_m: number | null
  min_elevation_m: number | null
  max_elevation_m: number | null
  estimated_duration_s?: number | null
  routing_provider?: string | null
  route_source_version?: string | null
  elevation_profile?: Elevation | null
  name?: string
  description?: string
  difficulty?: string | null
  surface_override?: string | null
}

export interface Dependency {
  poi_id: string
  position_revision_id: string
}

export interface Surface {
  track_id: string
  position: number
  from_fraction: number
  to_fraction: number
  surface_type: string
  source: string
}

export interface Snapshot {
  points: RoutePoint[]
  tracks: RouteTrack[]
  dependencies: Dependency[]
  surfaces: Surface[]
}

export interface Revision {
  revision_id: string
  version: string
}

export interface Receipt {
  kind: string
  request_hash: string
  result_version: string
  operation_details: Record<string, unknown>
}

const scheduleColumns = 'schedule_start_date, schedule_end_date, schedule_start_time, schedule_end_time, schedule_timezone'

function pointSql(expression: string): string {
  return `CASE WHEN ${expression} IS NOT NULL THEN jsonb_build_object(
    'lon', public.ST_X(${expression}), 'lat', public.ST_Y(${expression})) END`
}

export function lineGeoJsonSql(expression: string): string {
  return `(SELECT jsonb_build_object('type', 'LineString', 'coordinates',
    jsonb_agg(jsonb_build_array(public.ST_X(vertex.geom), public.ST_Y(vertex.geom)) ORDER BY vertex.path))
    FROM public.ST_DumpPoints(${expression}) AS vertex)`
}

export async function readHead(client: PoolClient, routeId: string, lock = false): Promise<Revision | null> {
  if (lock) {
    await client.query('INSERT INTO geo.route_geometries (route_id) VALUES ($1) ON CONFLICT DO NOTHING', [routeId])
    await client.query('SELECT route_id FROM geo.route_geometries WHERE route_id = $1 FOR UPDATE', [routeId])
  }
  const { rows: [head] } = await client.query<Revision>(
    `SELECT v.revision_id, v.version
       FROM geo.route_geometries g
       LEFT JOIN geo.route_geometry_versions v ON (v.route_id, v.version) = (g.route_id, g.head_version)
       WHERE g.route_id = $1`,
    [routeId],
  )
  return head?.revision_id ? head : null
}

export async function revisionById(client: PoolClient, routeId: string, revisionId: string): Promise<Revision | undefined> {
  const { rows: [revision] } = await client.query<Revision>(
    'SELECT revision_id, version FROM geo.route_geometry_versions WHERE route_id = $1 AND revision_id = $2 AND sealed',
    [routeId, revisionId],
  )
  return revision
}

function emptySnapshot(): Snapshot {
  return { points: [], tracks: [], dependencies: [], surfaces: [] }
}

export async function readSnapshot(client: PoolClient, routeId: string, version: string | null): Promise<Snapshot> {
  if (!version) return emptySnapshot()
  const args = [routeId, version]
  const { rows: points } = await client.query<RoutePoint>(
    `SELECT point_id, ${pointSql('geom')} AS position, ${pointSql('requested_geom')} AS requested_position,
       ${pointSql('snapped_geom')} AS snapped_position, name, description, poi_id,
       schedule_start_date::text, schedule_end_date::text, schedule_start_time::text, schedule_end_time::text, schedule_timezone
     FROM geo.route_points WHERE route_id = $1 AND route_version = $2 ORDER BY route_points.position`,
    args,
  )
  const { rows: tracks } = await client.query<RouteTrack>(
    `SELECT track_id, start_point_id, end_point_id, ${lineGeoJsonSql('geom')} AS geometry,
       build_mode, transport_mode, status, distance_m, estimated_duration_s, ascent_m, descent_m,
       min_elevation_m, max_elevation_m, routing_provider, route_source_version, name, description, difficulty,
       surface_override, elevation_profile,
       schedule_start_date::text, schedule_end_date::text, schedule_start_time::text, schedule_end_time::text, schedule_timezone
     FROM geo.tracks WHERE route_id = $1 AND route_version = $2 ORDER BY position`,
    args,
  )
  const { rows: dependencies } = await client.query<Dependency>(
    'SELECT poi_id, position_revision_id FROM geo.route_poi_dependencies WHERE route_id = $1 AND route_version = $2 ORDER BY poi_id',
    args,
  )
  const { rows: surfaces } = await client.query<Surface>(
    `SELECT track_id, position, from_fraction::float8, to_fraction::float8, surface_type, source
     FROM geo.track_surfaces WHERE route_id = $1 AND route_version = $2 ORDER BY track_id, position`,
    args,
  )
  return { points, tracks, dependencies, surfaces }
}

export async function readReceipt(client: PoolClient, routeId: string, actorId: string, key: string) {
  const { rows: [receipt] } = await client.query<Receipt>(
    `SELECT kind, request_hash, result_version, operation_details FROM geo.route_edit_operations
     WHERE route_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
    [routeId, actorId, key],
  )
  return receipt
}

export function pointWkt({ lon, lat }: LonLat): string {
  return `SRID=4326;POINT(${lon} ${lat})`
}

function lineWkt(line: GeoLine): string {
  return `SRID=4326;LINESTRING(${line.map(point => point.join(' ')).join(',')})`
}

export async function lineDistance(client: PoolClient, line: GeoLine): Promise<number> {
  const result = await client.query<{ distance: number }>(
    'SELECT public.ST_Length($1::public.geography) AS distance', [lineWkt(line)],
  )
  return result.rows[0]?.distance ?? 0
}

async function insertPoints(client: PoolClient, routeId: string, version: string, points: RoutePoint[]) {
  const rows = points.map((point, position) => ({
    ...point, position,
    geom: pointWkt(point.position),
    requested_geom: point.requested_position ? pointWkt(point.requested_position) : null,
    snapped_geom: point.snapped_position ? pointWkt(point.snapped_position) : null,
    point_type: position === 0 ? 'start' : position === points.length - 1 ? 'finish' : 'waypoint',
  }))
  await client.query(
    `INSERT INTO geo.route_points
       (route_id, route_version, point_id, position, geom, requested_geom, snapped_geom,
        name, description, point_type, poi_id, ${scheduleColumns})
     SELECT $1, $2, point_id, position, geom, requested_geom, snapped_geom,
        name, description, point_type, poi_id, ${scheduleColumns}
     FROM jsonb_populate_recordset(NULL::geo.route_points, $3::jsonb)`,
    [routeId, version, JSON.stringify(rows)],
  )
}

async function insertTracks(client: PoolClient, routeId: string, version: string, tracks: RouteTrack[]) {
  const rows = tracks.map((track, position) => ({ ...track, position, geom: lineWkt(track.geometry.coordinates) }))
  const columns = `track_id, position, start_point_id, end_point_id, geom, build_mode, transport_mode,
        status, name, description, difficulty, distance_m, estimated_duration_s, ascent_m, descent_m,
        min_elevation_m, max_elevation_m, surface_override, routing_provider, route_source_version,
        elevation_profile, ${scheduleColumns}`
  await client.query(
    `INSERT INTO geo.tracks (route_id, route_version, ${columns})
     SELECT $1, $2, ${columns} FROM jsonb_populate_recordset(NULL::geo.tracks, $3::jsonb)`,
    [routeId, version, JSON.stringify(rows)],
  )
}

interface SaveOperation {
  actorId: string
  key: string
  fingerprint: string
  kind: 'replace' | 'split' | 'restore'
  details?: Record<string, unknown>
}

function completeSum(tracks: RouteTrack[], key: 'ascent_m' | 'descent_m'): number | null {
  if (!tracks.length || tracks.some(track => track[key] === null)) return null
  return tracks.reduce((sum, track) => sum + (track[key] ?? 0), 0)
}

export async function saveSnapshot(
  client: PoolClient, routeId: string, baseVersion: string | null, snapshot: Snapshot, operation: SaveOperation,
): Promise<Revision> {
  const id = randomUUID()
  const { rows: [revision] } = await client.query<Revision>(
    `INSERT INTO geo.route_geometry_versions (route_id, version, revision_id, parent_version, status, distance_m, ascent_m, descent_m)
     VALUES ($1, COALESCE($2::bigint,0) + 1, $3, $2, $4, $5, $6, $7)
     RETURNING revision_id, version`,
    [routeId, baseVersion, id, snapshot.tracks.some(track => track.status === 'needs_rebuild') ? 'needs_rebuild' : 'ready',
      snapshot.tracks.reduce((sum, track) => sum + track.distance_m, 0),
      completeSum(snapshot.tracks, 'ascent_m'), completeSum(snapshot.tracks, 'descent_m')],
  )
  if (!revision) throw new Error('Route revision insert returned no result')
  const version = revision.version
  await insertPoints(client, routeId, version, snapshot.points)
  await insertTracks(client, routeId, version, snapshot.tracks)
  await client.query(
    `INSERT INTO geo.route_poi_dependencies (route_id, route_version, poi_id, position_revision_id)
     SELECT $1, $2, poi_id, position_revision_id
     FROM jsonb_populate_recordset(NULL::geo.route_poi_dependencies, $3::jsonb)`,
    [routeId, version, JSON.stringify(snapshot.dependencies)],
  )
  await client.query(
    `INSERT INTO geo.track_surfaces (route_id, route_version, track_id, position, from_fraction, to_fraction, surface_type, source)
     SELECT $1, $2, track_id, position, from_fraction, to_fraction, surface_type, source
     FROM jsonb_populate_recordset(NULL::geo.track_surfaces, $3::jsonb)`,
    [routeId, version, JSON.stringify(snapshot.surfaces)],
  )
  await client.query(
    'UPDATE geo.route_geometry_versions SET sealed_at = clock_timestamp() WHERE route_id = $1 AND version = $2',
    [routeId, version],
  )
  await client.query('UPDATE geo.route_geometries SET head_version = $2 WHERE route_id = $1', [routeId, version])
  const operationId = randomUUID()
  await client.query(
    `INSERT INTO geo.route_edit_operations
       (id, route_id, actor_user_id, idempotency_key, request_hash, base_version, result_version, kind, operation_details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [operationId, routeId, operation.actorId, operation.key, operation.fingerprint, baseVersion, version,
      operation.kind, JSON.stringify(operation.details ?? {})],
  )
  if (operation.kind === 'split') {
    const event = {
      event_id: randomUUID(), event_type: 'route.track.split', event_version: 1,
      occurred_at: new Date().toISOString(), producer: 'geo', aggregate_id: routeId, aggregate_version: Number(version),
      correlation_id: operationId, payload: { route_revision_id: revision.revision_id },
    }
    await client.query(
      `INSERT INTO geo.outbox_events
         (event_id, aggregate_id, aggregate_version, event_type, occurred_at, correlation_id, envelope)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.event_id, routeId, version, event.event_type, event.occurred_at, operationId, Buffer.from(JSON.stringify(event))],
    )
  }
  return revision
}

export async function tripModes(client: PoolClient, routeIds: string[]) {
  const { rows } = await client.query<{ modes: TransportMode[]; dependencies: Dependency[] }>(
    `SELECT COALESCE((
        SELECT array_agg(DISTINCT t.transport_mode) FROM geo.tracks t
        WHERE (t.route_id, t.route_version) = (g.route_id, g.head_version)
      ), ARRAY[]::text[]) AS modes,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('poi_id', d.poi_id, 'position_revision_id', d.position_revision_id))
        FROM geo.route_poi_dependencies d
        WHERE (d.route_id, d.route_version) = (g.route_id, g.head_version)
      ), '[]'::jsonb) AS dependencies
     FROM geo.route_geometries g WHERE g.route_id = ANY($1::uuid[])`,
    [routeIds],
  )
  return rows
}
