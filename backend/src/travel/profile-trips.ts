import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { BffProblem } from '../http/bff-problem.js';
import { TravelDatabase } from './travel-database.js';
import type { TravelEditor } from './travel.service.js';

export interface Completion {
  trip_id: string;
  participant_id: string;
  organizer_id: string;
}

interface TripStatistics {
  created: number;
  planned: number;
  in_progress: number;
  completed: number;
  archived: number;
}

@Injectable()
export class ProfileTrips {
  constructor(@Inject(TravelDatabase) private readonly database: TravelDatabase) {}

  ownFacts(userId: string) {
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const { rows: [stats] } = await client.query<TripStatistics>(
        `SELECT count(*)::int AS created, count(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived,
           count(*) FILTER (WHERE archived_at IS NULL AND publication_id IS NOT NULL AND lifecycle = 'planned')::int AS planned,
           count(*) FILTER (WHERE archived_at IS NULL AND publication_id IS NOT NULL AND lifecycle = 'in_progress')::int AS in_progress,
           count(*) FILTER (WHERE archived_at IS NULL AND publication_id IS NOT NULL AND lifecycle = 'completed')::int AS completed
         FROM travel.trips WHERE owner_user_id = $1`, [userId],
      );
      const { rows: routes } = await client.query<{ trip_id: string; route_id: string }>(
        `SELECT t.id AS trip_id, r.id AS route_id FROM travel.trips t JOIN travel.routes r ON r.trip_id = t.id
         WHERE t.created_by_user_id = $1`, [userId],
      );
      const { rows: [completions] } = await client.query<{ travel: number; organizing: number }>(
        `SELECT (SELECT count(*)::int FROM travel.trip_completions WHERE participant_id = $1) AS travel,
           (SELECT count(DISTINCT trip_id)::int FROM travel.trip_completions WHERE organizer_id = $1 AND participant_id <> $1) AS organizing`,
        [userId],
      );
      return { stats: stats!, routes, completions: completions! };
    });
  }

  completion(participantId: string, tripId: string) {
    return this.database.transaction(async (client) => {
      const { rows: [fact] } = await client.query<Completion>(
        'SELECT trip_id, participant_id, organizer_id FROM travel.trip_completions WHERE (trip_id, participant_id) = ($1, $2)',
        [tripId, participantId],
      );
      return fact;
    });
  }

  confirmCompletion(editor: TravelEditor, tripId: string) {
    return this.database.transaction(async (client) => {
      const userId = editor.userId;
      const { rows: [trip] } = await client.query<{ owner_user_id: string; eligible: boolean }>(
        `SELECT owner_user_id, (lifecycle = 'completed' AND archived_at IS NULL) AS eligible FROM travel.trips WHERE id = $1 FOR UPDATE`,
        [tripId],
      );
      await editor.confirmSession();
      const { rows: [existing] } = await client.query<Completion>(
        'SELECT trip_id, participant_id, organizer_id FROM travel.trip_completions WHERE (trip_id, participant_id) = ($1, $2)',
        [tripId, userId],
      );
      if (existing) {
        return existing;
      }
      if (!trip?.eligible) {
        throw new BffProblem('NOT_FOUND');
      }
      if (trip.owner_user_id === userId) {
        await client.query(
          'INSERT INTO travel.trip_participants (trip_id, user_id) VALUES ($1, $2) ON CONFLICT (trip_id,user_id) WHERE status = \'confirmed\' DO NOTHING',
          [tripId, userId],
        );
      }
      const { rows: [fact] } = await client.query<Completion>(
        `INSERT INTO travel.trip_completions (trip_id, participant_id, participant_entry_id, organizer_id)
         SELECT trip_id, user_id, id, $3 FROM travel.trip_participants WHERE trip_id = $1 AND user_id = $2 AND status = 'confirmed'
         RETURNING trip_id, participant_id, organizer_id`,
        [tripId, userId, trip.owner_user_id],
      );
      if (!fact) {
        throw new BffProblem('NOT_FOUND');
      }
      await client.query(
        'INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action) VALUES ($1, $2, \'trip.participant.complete\')',
        [tripId, userId],
      );
      return fact;
    });
  }
}
