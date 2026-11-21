import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { BffProblem } from '../../http/bff-problem.js';
import type {
  GeoLine,
  LonLat,
  TransportMode,
} from '../providers/index.js';
import { lineGeoJsonSql } from '../routes/route-store.js';

export interface GeoManifest {
  operationId: string;
  tripId: string;
  routes: { day_id: string; route_id: string; route_revision_id: string }[];
  poiIds: string[];
}

interface Batch {
  trip_id: string;
  active: boolean;
  manifest_hash: string | null;
}

export function manifestHash(manifest: GeoManifest) {
  const orderedRoutes = manifest.routes.map(route => [route.day_id, route.route_id, route.route_revision_id]);
  return createHash('sha256').update(JSON.stringify([manifest.tripId, orderedRoutes, [...manifest.poiIds].sort()])).digest('hex');
}

export async function lockBatch(client: PoolClient, operationId: string, tripId: string) {
  const { rows: [batch] } = await client.query<Batch>(
    'SELECT trip_id, active, manifest_hash FROM geo.route_hold_batches WHERE travel_operation_id = $1 FOR UPDATE',
    [operationId],
  );
  if (!batch || batch.trip_id !== tripId) {
    throw new BffProblem('PUBLICATION_PRECONDITION_FAILED');
  }
  return batch;
}

const publicRevision = `r.visibility = 'global' AND r.deleted_at IS NULL AND r.moderation_status = 'approved'
  AND r.approved_position_revision_id = r.position_revision_id`;

function dependenciesAllowed(visibility: string) {
  return `NOT EXISTS (
  SELECT FROM geo.route_points pt WHERE (pt.route_id, pt.route_version) = (v.route_id, v.version)
  AND pt.poi_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM geo.route_poi_dependencies d
    WHERE (d.route_id, d.route_version, d.poi_id) = (pt.route_id, pt.route_version, pt.poi_id)
  )
) AND NOT EXISTS (
  SELECT FROM geo.route_poi_dependencies d
  WHERE (d.route_id, d.route_version) = (v.route_id, v.version) AND NOT EXISTS (
    SELECT FROM geo.pois p JOIN geo.poi_revisions r ON (r.poi_id, r.id) = (p.id, p.head_revision_id)
    WHERE p.id = d.poi_id AND r.position_revision_id = d.position_revision_id AND ${visibility}
  )
)`;
}

const routeTopologyJoins = `CROSS JOIN LATERAL (
       SELECT count(*) AS count, max(p.position) AS last
       FROM geo.route_points p WHERE (p.route_id, p.route_version) = (v.route_id, v.version)
     ) points
     CROSS JOIN LATERAL (
       SELECT count(*) AS count, bool_and(t.status = 'ready' AND t.distance_m > 0
         AND a.position = t.position AND z.position = t.position + 1
         AND public.ST_Equals(public.ST_StartPoint(t.geom), a.geom)
         AND public.ST_Equals(public.ST_EndPoint(t.geom), z.geom)) AS connected
       FROM geo.tracks t
       JOIN geo.route_points a ON (a.route_id, a.route_version, a.point_id) = (t.route_id, t.route_version, t.start_point_id)
       JOIN geo.route_points z ON (z.route_id, z.route_version, z.point_id) = (t.route_id, t.route_version, t.end_point_id)
       WHERE (t.route_id, t.route_version) = (v.route_id, v.version)
     ) tracks`;

const validTopology = `(v.status = 'ready' AND points.count >= 2 AND points.last = points.count - 1
         AND tracks.count = points.count - 1 AND tracks.connected)`;

export async function countMappedTrips(client: PoolClient, routes: { route_id: string; trip_id: string }[]) {
  if (!routes.length) {
    return 0;
  }
  const { rows: [result] } = await client.query<{ total: number }>(
    `SELECT count(DISTINCT owned.trip_id)::int AS total
     FROM jsonb_to_recordset($1::jsonb) AS owned(route_id uuid, trip_id uuid)
     WHERE EXISTS (SELECT FROM geo.route_geometry_versions v
       ${routeTopologyJoins}
       WHERE v.route_id = owned.route_id AND v.sealed AND v.distance_m > 0 AND ${validTopology})`,
    [JSON.stringify(routes)],
  );
  return result!.total;
}

export async function retainRoutes(client: PoolClient, manifest: GeoManifest) {
  const routeIds = manifest.routes.map(route => route.route_id);
  await client.query('SELECT route_id FROM geo.route_geometries WHERE route_id = ANY($1::uuid[]) ORDER BY route_id FOR SHARE', [routeIds]);
  await client.query(
    `SELECT id FROM geo.pois WHERE id IN (
       SELECT unnest($1::uuid[]) UNION
       SELECT d.poi_id FROM geo.route_geometries g JOIN geo.route_poi_dependencies d
         ON (d.route_id, d.route_version) = (g.route_id, g.head_version) WHERE g.route_id = ANY($2::uuid[])
     ) ORDER BY id FOR SHARE`,
    [manifest.poiIds, routeIds],
  );
  const { rows } = await client.query<{ route_id: string; revision_id: string; ready: boolean; allowed: boolean }>(
    `SELECT v.route_id, v.revision_id,
       ${validTopology} AS ready,
       ${dependenciesAllowed(publicRevision)} AS allowed
     FROM geo.route_geometries g
     JOIN geo.route_geometry_versions v ON (v.route_id, v.version) = (g.route_id, g.head_version) AND v.sealed
     ${routeTopologyJoins}
     WHERE g.route_id = ANY($1::uuid[])`,
    [routeIds],
  );
  const byId = new Map(rows.map(row => [row.route_id, row]));
  for (const route of manifest.routes) {
    const current = byId.get(route.route_id);
    if (current?.revision_id !== route.route_revision_id) {
      throw new BffProblem('ROUTE_REVISION_CONFLICT');
    }
    if (!current.ready) {
      throw new BffProblem('ROUTE_NOT_READY');
    }
    if (!current.allowed) {
      throw new BffProblem('POI_PUBLICATION_RESTRICTED');
    }
  }
  await client.query(
    `INSERT INTO geo.route_geometry_holds (travel_operation_id, route_id, route_version)
     SELECT $1, route_id, head_version FROM geo.route_geometries WHERE route_id = ANY($2::uuid[])`,
    [manifest.operationId, routeIds],
  );
}

export async function selectedPois(client: PoolClient, manifest: GeoManifest, requireAttachment: boolean) {
  const { rows } = await client.query<{ poi_id: string; name: string; position: LonLat }>(
    `SELECT p.id AS poi_id, r.name, jsonb_build_object('lon', public.ST_X(pos.geom), 'lat', public.ST_Y(pos.geom)) AS position
     FROM geo.pois p JOIN geo.poi_revisions r ON (r.poi_id, r.id) = (p.id, p.head_revision_id)
     JOIN geo.poi_position_revisions pos ON (pos.poi_id, pos.id) = (r.poi_id, r.position_revision_id)
     WHERE p.id = ANY($1::uuid[]) AND ${publicRevision}
       AND (NOT $2::boolean OR EXISTS (SELECT FROM geo.trip_pois tp WHERE (tp.trip_id, tp.poi_id) = ($3, p.id)))
     ORDER BY p.id`,
    [manifest.poiIds, requireAttachment, manifest.tripId],
  );
  if (requireAttachment && rows.length !== manifest.poiIds.length) {
    throw new BffProblem('POI_PUBLICATION_RESTRICTED');
  }
  return rows;
}

interface HeldRoute {
  operation_id: string;
  route_id: string;
  revision_id: string;
  distance_m: number;
  start: LonLat | null;
  allowed: boolean;
}

export async function heldSummaries(client: PoolClient, manifests: GeoManifest[], preparing = false) {
  const expected = manifests.map(m => ({
    operation_id: m.operationId,
    first_route_id: m.routes[0]?.route_id,
  }));
  const { rows: batches } = await client.query<Batch & { operation_id: string; poi_ids: string[] }>(
    `SELECT b.travel_operation_id AS operation_id, b.trip_id, b.active, b.manifest_hash,
       ARRAY(SELECT poi_id FROM geo.route_hold_batch_pois p WHERE p.travel_operation_id = b.travel_operation_id ORDER BY poi_id) AS poi_ids
     FROM geo.route_hold_batches b WHERE b.travel_operation_id = ANY($1::uuid[])`,
    [manifests.map(m => m.operationId)],
  );
  const { rows: routes } = await client.query<HeldRoute>(
    `SELECT e.operation_id, h.route_id, v.revision_id, v.distance_m, ${dependenciesAllowed(publicRevision)} AS allowed,
       CASE WHEN p.geom IS NOT NULL THEN jsonb_build_object('lon', public.ST_X(p.geom), 'lat', public.ST_Y(p.geom)) END AS start
     FROM jsonb_to_recordset($1::jsonb) AS e(operation_id uuid, first_route_id uuid)
     JOIN geo.route_geometry_holds h ON h.travel_operation_id = e.operation_id
     JOIN geo.route_geometry_versions v ON (v.route_id, v.version) = (h.route_id, h.route_version) AND v.sealed
     LEFT JOIN geo.route_points p ON h.route_id = e.first_route_id
       AND (p.route_id, p.route_version, p.position) = (h.route_id, h.route_version, 0)`,
    [JSON.stringify(expected)],
  );
  const batchById = new Map(batches.map(batch => [batch.operation_id, batch]));
  const held = new Map<string, Map<string, HeldRoute>>();
  for (const route of routes) {
    const entry = held.get(route.operation_id) ?? new Map<string, HeldRoute>();
    entry.set(route.route_id, route);
    held.set(route.operation_id, entry);
  }
  return manifests.map((manifest) => {
    const batch = batchById.get(manifest.operationId);
    if (preparing && batch && !batch.active) {
      throw new BffProblem('PUBLICATION_CANCELLED');
    }
    const current = held.get(manifest.operationId);
    const start = current?.get(manifest.routes[0]?.route_id ?? '')?.start;
    const selected = new Set(manifest.poiIds);
    if (!batch?.active || batch.trip_id !== manifest.tripId || !current || !start
      || (batch.manifest_hash && batch.manifest_hash !== manifestHash(manifest))
      || current.size !== manifest.routes.length || batch.poi_ids.length !== selected.size
      || batch.poi_ids.some(id => !selected.has(id))
      || manifest.routes.some(route => current.get(route.route_id)?.revision_id !== route.route_revision_id)) {
      throw new BffProblem(preparing ? 'PUBLICATION_PRECONDITION_FAILED' : 'DEPENDENCY_UNAVAILABLE');
    }
    const routes = [...current.values()];
    return routes.every(route => route.allowed)
      ? { start, route_count: routes.length, total_distance_m: routes.reduce((sum, route) => sum + route.distance_m, 0) }
      : null;
  });
}

export interface OwnedRouteSet {
  trip_id: string;
  archived: boolean;
  route_ids: string[];
}

export interface OwnedRouteSummary {
  total_distance_m: number | null;
  trip_type: TransportMode | 'combined' | null;
}

export async function ownedRouteSummaries(client: PoolClient, userId: string, trips: OwnedRouteSet[]) {
  const readable = `r.deleted_at IS NULL AND ((${publicRevision}) OR
    (r.visibility = 'trip' AND r.scope_trip_id = owned.trip_id AND NOT owned.archived) OR
    (r.visibility <> 'trip' AND p.author_user_id = $2))`;
  const { rows } = await client.query<OwnedRouteSummary & { trip_id: string }>(
    `WITH totals AS (
       SELECT owned.trip_id, bool_and(${dependenciesAllowed(readable)}) AS readable,
         COALESCE(sum(v.distance_m), 0) AS distance_m, min(modes.first_mode) AS first_mode, max(modes.last_mode) AS last_mode
       FROM jsonb_to_recordset($1::jsonb) AS owned(trip_id uuid, route_ids uuid[], archived boolean)
       CROSS JOIN LATERAL unnest(owned.route_ids) AS requested(route_id)
       LEFT JOIN geo.route_geometries g ON g.route_id = requested.route_id
       LEFT JOIN geo.route_geometry_versions v ON (v.route_id,v.version) = (g.route_id,g.head_version) AND v.sealed
       CROSS JOIN LATERAL (
         SELECT min(transport_mode) AS first_mode, max(transport_mode) AS last_mode
         FROM geo.tracks WHERE (route_id,route_version) = (v.route_id,v.version)
       ) modes
       GROUP BY owned.trip_id
     ) SELECT trip_id, CASE WHEN readable THEN distance_m END AS total_distance_m,
       CASE WHEN readable THEN CASE WHEN first_mode = last_mode THEN first_mode WHEN first_mode IS NOT NULL THEN 'combined' END END AS trip_type
     FROM totals`,
    [JSON.stringify(trips), userId],
  );
  return new Map(rows.map(({ trip_id, ...summary }) => [trip_id, summary]));
}

const heldTracks = `FROM geo.route_geometry_holds h JOIN geo.tracks t
  ON (t.route_id, t.route_version) = (h.route_id, h.route_version) WHERE h.travel_operation_id = $1`;

export async function tripType(client: PoolClient, operationId: string) {
  const { rows } = await client.query<{ transport_mode: TransportMode }>(`SELECT DISTINCT t.transport_mode ${heldTracks}`, [operationId]);
  const first = rows[0];
  if (!first) {
    throw new BffProblem('ROUTE_NOT_READY');
  }
  return rows.length === 1 ? first.transport_mode : 'combined';
}

export async function publicDays(client: PoolClient, manifest: GeoManifest) {
  type Line = { type: 'LineString'; coordinates: GeoLine };
  type Leg = { name: string | null; start_name: string | null; end_name: string | null; distance_m: number; transport_mode: TransportMode };
  const { rows } = await client.query<{ route_id: string; lines: Line[]; legs: Leg[] }>(
    `SELECT t.route_id, jsonb_agg(${lineGeoJsonSql('t.geom')} ORDER BY t.position) AS lines,
       jsonb_agg(jsonb_build_object('name', t.name, 'start_name', a.name, 'end_name', b.name,
         'distance_m', t.distance_m, 'transport_mode', t.transport_mode) ORDER BY t.position) AS legs
     FROM geo.route_geometry_holds h JOIN geo.tracks t
       ON (t.route_id, t.route_version) = (h.route_id, h.route_version)
     JOIN geo.route_points a ON (a.route_id,a.route_version,a.point_id) = (t.route_id,t.route_version,t.start_point_id)
     JOIN geo.route_points b ON (b.route_id,b.route_version,b.point_id) = (t.route_id,t.route_version,t.end_point_id)
     WHERE h.travel_operation_id = $1 GROUP BY t.route_id`,
    [manifest.operationId],
  );
  const routes = new Map(rows.map(route => [route.route_id, route]));
  return manifest.routes.map(({ route_id }, index) => {
    const route = routes.get(route_id);
    if (!route?.lines.length) {
      throw new BffProblem('DEPENDENCY_UNAVAILABLE');
    }
    return { position: index + 1, lines: route.lines, legs: route.legs };
  });
}
