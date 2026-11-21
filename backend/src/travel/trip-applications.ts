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

export type RosterAction = 'accept' | 'decline' | 'remove';
interface RosterEntry {
  id: string;
  user_id: string;
  status: 'pending' | 'joined';
}

export const participantCountSql = `CROSS JOIN LATERAL (
  SELECT count(*)::int AS confirmed_participants FROM travel.trip_participants p
  WHERE p.trip_id = t.id AND p.status = 'confirmed'
) seats`;

export const activeCapacitySql = `CASE WHEN v.publication_id IS NULL THEN t.free_capacity ELSE (v.snapshot->>'free_capacity')::int END`;

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

async function joinTrip(client: PoolClient, tripId: string, userId: string, actor = userId) {
  await client.query(
    `WITH joined AS (
       INSERT INTO travel.trip_participants (trip_id, user_id) VALUES ($1, $2) RETURNING id
     ), accepted AS (
       UPDATE travel.trip_applications SET status = 'accepted', decided_at = clock_timestamp()
       WHERE trip_id = $1 AND applicant_user_id = $2 AND status = 'pending' RETURNING id
     ) INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action, object_id)
       SELECT $1, $3::uuid, 'trip.participant.join', id FROM joined
       UNION ALL SELECT $1, $3, 'trip.application.accept', id FROM accepted`,
    [tripId, userId, actor],
  );
}

async function ownedRosterState(client: PoolClient, tripId: string, owner: string, write = false) {
  const lock = await client.query(
    `SELECT FROM travel.trips WHERE id = $1 AND owner_user_id = $2 FOR ${write ? 'UPDATE' : 'SHARE'}`, [tripId, owner],
  );
  if (!lock.rowCount) {
    throw new BffProblem('NOT_FOUND');
  }
  const { rows: [state] } = await client.query<{ occupied_slots: number; capacity: number | null; can_accept: boolean; can_manage: boolean; publication_id: string | null; access_generation: string }>(
    `SELECT t.publication_id, t.access_generation, seats.confirmed_participants AS occupied_slots,
       ${activeCapacitySql} AS capacity,
       t.archived_at IS NULL AND t.lifecycle = 'planned' AS can_manage,
       t.publication_id IS NOT NULL AND ${applicationsOpenSql} AS can_accept
     FROM travel.trips t LEFT JOIN travel.trip_versions v ON (t.id,t.publication_id) = (v.trip_id,v.publication_id)
     ${participantCountSql} WHERE t.id = $1`, [tripId],
  );
  return state!;
}

@Injectable()
export class TripApplications {
  constructor(@Inject(TravelDatabase) private readonly database: TravelDatabase) {}

  roster(userId: string, tripId: string) {
    return this.database.transaction(async (client) => {
      const state = await ownedRosterState(client, tripId, userId);
      const { rows: items } = await client.query<RosterEntry>(
        `SELECT id, user_id, status FROM (
           SELECT id, applicant_user_id AS user_id, 'pending' AS status, created_at AS since
           FROM travel.trip_applications WHERE trip_id = $1 AND status = 'pending'
           UNION ALL SELECT id, user_id, 'joined', joined_at
           FROM travel.trip_participants WHERE trip_id = $1 AND status = 'confirmed'
         ) roster ORDER BY since, id`, [tripId],
      );
      return {
        occupied_slots: state.occupied_slots,
        capacity: state.capacity,
        can_accept: state.can_accept,
        can_manage: state.can_manage,
        items,
      };
    });
  }

  decide(editor: TravelEditor, tripId: string, entryId: string, action: RosterAction, confirmPublicRoute: (publicationId: string | null, generation: string) => Promise<void>) {
    return this.database.transaction(async (client) => {
      const state = await ownedRosterState(client, tripId, editor.userId, true);
      await editor.confirmSession();
      if (action === 'remove') {
        const { rows: [participant] } = await client.query<{ status: string }>(
          'SELECT status FROM travel.trip_participants WHERE trip_id = $1 AND id = $2', [tripId, entryId],
        );
        if (!participant) {
          throw new BffProblem('NOT_FOUND');
        }
        if (participant.status === 'removed') {
          return;
        }
        if (!state.can_manage) {
          throw new BffProblem('TRIP_APPLICATION_UNAVAILABLE');
        }
        await client.query('UPDATE travel.trip_participants SET status = \'removed\' WHERE id = $1', [entryId]);
      }
      else {
        const { rows: [application] } = await client.query<{ status: string; applicant_user_id: string }>(
          'SELECT status, applicant_user_id FROM travel.trip_applications WHERE trip_id = $1 AND id = $2', [tripId, entryId],
        );
        if (!application) {
          throw new BffProblem('NOT_FOUND');
        }
        if (application.status === (action === 'accept' ? 'accepted' : 'declined')) {
          return;
        }
        if (!state.can_manage || application.status !== 'pending') {
          throw new BffProblem('TRIP_APPLICATION_UNAVAILABLE');
        }
        if (action === 'accept') {
          if (!state.can_accept) {
            throw new BffProblem('TRIP_APPLICATION_UNAVAILABLE');
          }
          await confirmPublicRoute(state.publication_id, state.access_generation);
          await editor.confirmSession();
          await joinTrip(client, tripId, application.applicant_user_id, editor.userId);
          return;
        }
        await client.query('UPDATE travel.trip_applications SET status = \'declined\', decided_at = clock_timestamp() WHERE id = $1', [entryId]);
      }
      await client.query(
        'INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action, object_id) VALUES ($1,$2,$3,$4)',
        [tripId, editor.userId, action === 'remove' ? 'trip.participant.remove' : 'trip.application.decline', entryId],
      );
    });
  }

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
