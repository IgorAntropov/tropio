import {
  Inject,
  Injectable,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BffProblem } from '../http/bff-problem.js';
import type { Candidate } from './public-catalog.js';
import { TravelDatabase } from './travel-database.js';
import type { AdmissionMode } from './travel-input.js';
import type { TravelEditor } from './travel.service.js';

export const participantCountSql = `CROSS JOIN LATERAL (
  SELECT count(*)::int AS confirmed_participants FROM travel.trip_participants p
  WHERE p.trip_id = t.id AND p.status = 'confirmed'
) seats`;

export const applicationsOpenSql = `(t.lifecycle = 'planned' AND v.snapshot->>'lifecycle' = 'planned'
  AND (v.snapshot->>'free_capacity' IS NULL OR seats.confirmed_participants < (v.snapshot->>'free_capacity')::int)
  AND CASE WHEN v.meeting_at IS NOT NULL THEN v.meeting_at > statement_timestamp()
       ELSE v.snapshot->>'start_date' IS NULL OR (v.snapshot->>'start_date')::date >=
         (statement_timestamp() AT TIME ZONE COALESCE(v.snapshot->>'timezone', 'UTC'))::date END)`;

async function requestParticipation(client: PoolClient, tripId: string, userId: string) {
  await client.query(
    `WITH submitted AS (
       INSERT INTO travel.trip_applications (trip_id, applicant_user_id) VALUES ($1, $2) RETURNING id
     ) INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action, object_id)
       SELECT $1, $2, 'trip.application.submit', id FROM submitted`,
    [tripId, userId],
  );
}

async function joinTrip(client: PoolClient, tripId: string, userId: string) {
  await client.query(
    `WITH joined AS (
       INSERT INTO travel.trip_participants (trip_id, user_id) VALUES ($1, $2) RETURNING id
     ), accepted AS (
       UPDATE travel.trip_applications SET status = 'accepted', decided_at = clock_timestamp()
       WHERE trip_id = $1 AND applicant_user_id = $2 AND status = 'pending' RETURNING id
     ) INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action, object_id)
       SELECT $1, $2, 'trip.participant.join', id FROM joined
       UNION ALL SELECT $1, $2, 'trip.application.accept', id FROM accepted`,
    [tripId, userId],
  );
}

@Injectable()
export class TripApplications {
  constructor(@Inject(TravelDatabase) private readonly database: TravelDatabase) {}

  submit(candidate: Candidate, applicant: TravelEditor, mode: AdmissionMode, confirmPublicRoute: () => Promise<void>) {
    return this.database.transaction(async (client) => {
      const current = await client.query(
        `SELECT FROM travel.trips WHERE id = $1 AND publication_id = $2 AND access_generation = $3 AND owner_user_id = $4
           AND visibility = 'public' AND archived_at IS NULL FOR UPDATE`,
        [candidate.tripId, candidate.publication_id, candidate.access_generation, candidate.ownerId],
      );
      if (!current.rowCount) {
        return null;
      }
      await applicant.confirmSession();
      await confirmPublicRoute();
      if (candidate.ownerId === applicant.userId) {
        throw new BffProblem('TRIP_APPLICATION_UNAVAILABLE');
      }
      const { rows: [state] } = await client.query<{ open: boolean; pending: boolean; joined: boolean }>(
        `SELECT ${applicationsOpenSql} AS open,
           EXISTS (SELECT FROM travel.trip_participants WHERE trip_id = $1 AND user_id = $2 AND status = 'confirmed') AS joined,
           EXISTS (SELECT FROM travel.trip_applications WHERE trip_id = $1 AND applicant_user_id = $2 AND status = 'pending') AS pending
         FROM travel.trips t JOIN travel.trip_versions v ON (v.trip_id, v.publication_id) = (t.id, t.publication_id)
         ${participantCountSql} WHERE t.id = $1`,
        [candidate.tripId, applicant.userId],
      );
      if (state?.joined) {
        return 'joined' as const;
      }
      if (state?.pending && mode === 'request') {
        return 'pending' as const;
      }
      if (!state?.open || mode !== (candidate.snapshot.admission_mode ?? 'request')) {
        throw new BffProblem('TRIP_APPLICATION_UNAVAILABLE');
      }
      if (mode === 'open') {
        await joinTrip(client, candidate.tripId, applicant.userId);
        return 'joined' as const;
      }
      await requestParticipation(client, candidate.tripId, applicant.userId);
      return 'pending' as const;
    });
  }
}
