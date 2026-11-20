import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { BffProblem } from '../http/bff-problem.js'

export interface PublicationTrip {
  trip_id: string
  owner_user_id: string
  trip_revision_id: string
  publication_id: string | null
  visibility: 'private' | 'public'
  archived_at: Date | null
}

export const manifestColumns = (operation: 'o.id' | 'v.operation_id') => `
  ARRAY(SELECT poi_id FROM travel.route_operation_pois WHERE operation_id = ${operation} ORDER BY poi_id) AS "poiIds",
  (SELECT jsonb_agg(jsonb_build_object('day_id', day_id, 'route_id', route_id, 'route_revision_id', route_revision_id)
     ORDER BY day_position) FROM travel.route_operation_routes WHERE operation_id = ${operation}) AS routes`

export async function publicationTrip(client: PoolClient, tripId: string, ownerId?: string) {
  const { rows: [trip] } = await client.query<PublicationTrip>(
    `SELECT id AS trip_id, owner_user_id, trip_revision_id, publication_id, visibility, archived_at
     FROM travel.trips WHERE id = $1 AND ($2::uuid IS NULL OR owner_user_id = $2) FOR UPDATE`,
    [tripId, ownerId ?? null],
  )
  if (!trip) throw new BffProblem('NOT_FOUND')
  return trip
}

export function checkRevision(trip: PublicationTrip, revision: string) {
  if (trip.trip_revision_id !== revision) {
    throw new BffProblem('TRIP_REVISION_CONFLICT', { currentTripRevisionId: trip.trip_revision_id })
  }
}

export async function publicationEvent(
  client: PoolClient, tripId: string, actor: string, correlation: string,
  type: 'trip.published' | 'trip.unpublished', publicationId: string,
) {
  const { rows: [state] } = await client.query<{ version: string; at: Date }>(
    'SELECT version, clock_timestamp() AS at FROM travel.trips WHERE id = $1', [tripId],
  )
  if (!state) throw new BffProblem('DEPENDENCY_UNAVAILABLE')
  const envelope = {
    event_id: randomUUID(), event_type: type, event_version: 1, occurred_at: state.at.toISOString(),
    producer: 'travel', aggregate_id: tripId, aggregate_version: Number(state.version), correlation_id: correlation,
    payload: type === 'trip.published' ? { publication_id: publicationId } : { previous_publication_id: publicationId },
  }
  await client.query(
    `INSERT INTO travel.outbox_events (event_id, aggregate_id, aggregate_version, event_type, correlation_id, occurred_at, envelope)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [envelope.event_id, tripId, state.version, type, correlation, state.at, Buffer.from(JSON.stringify(envelope))],
  )
  await client.query(
    'INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action, object_id) VALUES ($1,$2,$3,$4)',
    [tripId, actor, type, publicationId],
  )
}

export async function failPending(client: PoolClient, tripId: string, code: string, operationId?: string) {
  const { rowCount } = await client.query(
    `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
     UPDATE travel.route_operations SET status = 'failed', error_code = $2,
       finished_at = instant.at, release_requested_at = instant.at, release_next_attempt_at = instant.at
     FROM instant WHERE trip_id = $1 AND kind = 'publish' AND status = 'pending' AND ($3::uuid IS NULL OR id = $3)`,
    [tripId, code, operationId ?? null],
  )
  return rowCount ?? 0
}

export async function revokePublication(
  client: PoolClient, trip: Pick<PublicationTrip, 'trip_id' | 'publication_id' | 'trip_revision_id'>,
  actor: string, correlation: string, change: 'unpublish' | 'private' | 'archive',
) {
  const cancelled = await failPending(client, trip.trip_id, 'PUBLICATION_CANCELLED')
  if (!cancelled && !trip.publication_id && change === 'unpublish') return trip.trip_revision_id
  const { rows: [updated] } = await client.query<{ trip_revision_id: string }>(
    `UPDATE travel.trips SET publication_id = NULL, access_generation = access_generation + 1,
     trip_revision_id = gen_random_uuid(), version = version + 1, updated_at = greatest(updated_at, clock_timestamp()),
     visibility = CASE WHEN $2 = 'private' THEN 'private' ELSE visibility END,
     archived_at = CASE WHEN $2 = 'archive' THEN clock_timestamp() ELSE archived_at END
     WHERE id = $1 RETURNING trip_revision_id`, [trip.trip_id, change],
  )
  await client.query('DELETE FROM travel.trip_catalog_entries WHERE trip_id = $1', [trip.trip_id])
  if (trip.publication_id) {
    await publicationEvent(client, trip.trip_id, actor, correlation, 'trip.unpublished', trip.publication_id)
  }
  return updated!.trip_revision_id
}
