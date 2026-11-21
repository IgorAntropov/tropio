import { BffProblem } from '../http/bff-problem.js';
import {
  checkRevision,
  publicationTrip,
} from './publication-state.js';
import type { TravelDatabase } from './travel-database.js';
import type { TravelEditor } from './travel.service.js';

export type TripLifecycle = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export async function recordLifecycle(
  database: TravelDatabase, editor: TravelEditor, tripId: string, key: string,
  expectedRevision: string, lifecycle: Exclude<TripLifecycle, 'planned'>,
) {
  return database.transaction(async (client) => {
    const trip = await publicationTrip(client, tripId, editor.userId);
    await editor.confirmSession();
    const action = 'trip.lifecycle.' + lifecycle;
    const { rows: [previous] } = await client.query<{ matches: boolean }>(
      'SELECT (trip_id, actor_user_id, action, object_id) = ($2, $3, $4, $5) AS matches FROM travel.trip_audit_events WHERE id = $1',
      [key, tripId, editor.userId, action, expectedRevision],
    );
    if (previous) {
      if (!previous.matches) {
        throw new BffProblem('IDEMPOTENCY_KEY_REUSED');
      }
      return;
    }
    if (!trip.publication_id || trip.archived_at) {
      throw new BffProblem('NOT_FOUND');
    }
    checkRevision(trip, expectedRevision);
    await client.query(
      `UPDATE travel.trips SET lifecycle = $2, trip_revision_id = gen_random_uuid(), version = version + 1,
       updated_at = greatest(updated_at, clock_timestamp()) WHERE id = $1`,
      [tripId, lifecycle],
    );
    await client.query(
      'INSERT INTO travel.trip_audit_events (id, trip_id, actor_user_id, action, object_id) VALUES ($1, $2, $3, $4, $5)',
      [key, tripId, editor.userId, action, expectedRevision],
    );
  });
}
