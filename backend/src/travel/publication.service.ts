import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GeoManifest } from '../geo/publication/geo-publication.service.js';
import { BffProblem } from '../http/bff-problem.js';
import { fingerprint } from '../publication/publication-input.js';
import type {
  publishInput,
  unpublishInput,
} from '../publication/publication-input.js';
import {
  checkRevision,
  failPending,
  manifestColumns,
  publicationEvent,
  publicationTrip,
  revokePublication,
} from './publication-state.js';
import type { PublicationTrip } from './publication-state.js';
import { TravelDatabase } from './travel-database.js';
import { participantCountSql } from './trip-applications.js';
import { getDraft } from './travel.service.js';
import type { TravelEditor } from './travel.service.js';

interface Operation {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
  initiator_user_id: string;
  expected_trip_revision_id: string;
  expected_publication_id: string | null;
  result_trip_revision_id: string | null;
  error_code: string | null;
  expired: boolean;
  request_fingerprint: string;
  publication_id: string | null;
}

const operationColumns = `o.id, o.status, o.initiator_user_id, o.expected_trip_revision_id, o.expected_publication_id,
  o.result_trip_revision_id, o.error_code, o.deadline_at <= clock_timestamp() AS expired, o.request_fingerprint,
  (SELECT publication_id FROM travel.trip_versions WHERE operation_id = o.id) AS publication_id`;

function result(op: Operation) {
  const operation_id = op.id;
  if (op.status === 'pending') {
    return { operation_id, status: op.status };
  }
  if (op.status === 'failed') {
    return { operation_id, status: op.status, code: op.error_code! };
  }
  return {
    operation_id,
    status: op.status,
    publication_id: op.publication_id!,
    trip_revision_id: op.result_trip_revision_id!,
  };
}

async function previous(
  client: PoolClient, tripId: string, userId: string, kind: string, key: string, hash: string,
) {
  const { rows: [op] } = await client.query<Operation>(
    `SELECT ${operationColumns} FROM travel.route_operations o
     WHERE o.trip_id = $1 AND o.initiator_user_id = $2 AND o.kind = $3 AND o.idempotency_key = $4`,
    [tripId, userId, kind, key],
  );
  if (op && op.request_fingerprint !== hash) {
    throw new BffProblem('IDEMPOTENCY_KEY_REUSED');
  }
  return op;
}

async function ownerTrip(client: PoolClient, editor: TravelEditor, tripId: string) {
  const trip = await publicationTrip(client, tripId, editor.userId);
  if (trip.archived_at) {
    throw new BffProblem('NOT_FOUND');
  }
  await editor.confirmSession();
  return trip;
}

export type Job = { id: string; trip_id: string };
type Verified = { start: { lon: number; lat: number }; tripType: string };

@Injectable()
export class PublicationService {
  constructor(@Inject(TravelDatabase) private readonly database: TravelDatabase) {}

  claim(phase: 'prepare' | 'release') {
    const condition = phase === 'prepare'
      ? 'kind = \'publish\' AND status = \'pending\''
      : 'release_requested_at IS NOT NULL AND release_acknowledged_at IS NULL';
    return this.database.transaction(async (client) => {
      const { rows: [job] } = await client.query<Job>(
        `WITH next_job AS (
           SELECT id FROM travel.route_operations WHERE ${condition} AND ${phase}_next_attempt_at <= clock_timestamp()
           ORDER BY ${phase}_next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
         ) UPDATE travel.route_operations o SET ${phase}_attempt_count = ${phase}_attempt_count + 1,
           ${phase}_next_attempt_at = clock_timestamp() + make_interval(secs => power(2, least(5, ${phase}_attempt_count))::int)
         FROM next_job WHERE o.id = next_job.id RETURNING o.id, o.trip_id`,
      );
      return job;
    });
  }

  acknowledgeRelease(job: Job) {
    return this.database.transaction(client => client.query(
      `UPDATE travel.route_operations SET release_acknowledged_at = clock_timestamp(), release_next_attempt_at = NULL
         WHERE id = $1 AND release_requested_at IS NOT NULL AND release_acknowledged_at IS NULL`, [job.id],
    ));
  }

  publish(editor: TravelEditor, tripId: string, key: string, command: ReturnType<typeof publishInput>) {
    const hash = fingerprint(command);
    return this.database.transaction(async (client) => {
      const trip = await ownerTrip(client, editor, tripId);
      const prior = await previous(client, tripId, editor.userId, 'publish', key, hash);
      if (prior) {
        return result(prior);
      }
      checkRevision(trip, command.trip_revision_id);
      if (trip.visibility !== 'public') {
        throw new BffProblem('INVALID_PUBLICATION_MANIFEST');
      }
      const { rows: days } = await client.query<{ day_id: string; position: number; route_id: string | null }>(
        `SELECT d.id AS day_id, d.position, r.id AS route_id FROM travel.trip_days d LEFT JOIN travel.routes r
         ON r.trip_day_id = d.id AND r.trip_id = d.trip_id AND r.archived_at IS NULL
         WHERE d.trip_id = $1 AND d.archived_at IS NULL ORDER BY d.position`, [tripId],
      );
      if (days.length !== command.routes.length || days.some((day, index) =>
        day.day_id !== command.routes[index]?.day_id || day.route_id !== command.routes[index]?.route_id)) {
        throw new BffProblem('INVALID_PUBLICATION_MANIFEST');
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO travel.route_operations (id, trip_id, initiator_user_id, kind, expected_trip_revision_id,
         expected_publication_id, idempotency_key, request_fingerprint, deadline_at)
         VALUES ($1,$2,$3,'publish',$4,$5,$6,$7,clock_timestamp() + interval '2 minutes')`,
        [id, tripId, editor.userId, trip.trip_revision_id, trip.publication_id, key, hash],
      );
      await client.query(
        `INSERT INTO travel.route_operation_routes (trip_id, operation_id, day_id, route_id, route_revision_id, day_position)
         SELECT $1,$2,day_id,route_id,route_revision_id,position FROM jsonb_to_recordset($3::jsonb)
           AS routes(day_id uuid, route_id uuid, route_revision_id uuid, position integer)`,
        [tripId, id, JSON.stringify(command.routes.map((route, i) => ({ ...route, position: days[i]!.position })))],
      );
      await client.query(
        `INSERT INTO travel.route_operation_pois (trip_id, operation_id, poi_id) SELECT $1,$2,unnest($3::uuid[])`,
        [tripId, id, command.poi_ids],
      );
      await client.query('UPDATE travel.route_operations SET manifest_sealed_at = clock_timestamp() WHERE id = $1', [id]);
      return { operation_id: id, status: 'pending' as const };
    });
  }

  status(userId: string, tripId: string, operationId: string) {
    return this.database.transaction(async (client) => {
      const { rows: [op] } = await client.query<Operation>(
        `SELECT ${operationColumns} FROM travel.route_operations o JOIN travel.trips t ON t.id = o.trip_id
         WHERE t.id = $1 AND t.owner_user_id = $2 AND t.archived_at IS NULL AND o.id = $3
           AND o.kind = 'publish' AND o.initiator_user_id = $2`, [tripId, userId, operationId],
      );
      if (!op) {
        throw new BffProblem('NOT_FOUND');
      }
      return result(op);
    });
  }

  unpublish(editor: TravelEditor, tripId: string, key: string, command: ReturnType<typeof unpublishInput>) {
    const hash = fingerprint(command);
    return this.database.transaction(async (client) => {
      const trip = await ownerTrip(client, editor, tripId);
      const prior = await previous(client, tripId, editor.userId, 'unpublish', key, hash);
      if (prior) {
        return { publication_id: null, trip_revision_id: prior.result_trip_revision_id! };
      }
      checkRevision(trip, command.trip_revision_id);
      if (command.publication_id !== trip.publication_id) {
        throw new BffProblem('TRIP_REVISION_CONFLICT', { currentTripRevisionId: trip.trip_revision_id });
      }
      const id = randomUUID();
      const revision = await revokePublication(client, trip, editor.userId, id, 'unpublish');
      await client.query(
        `INSERT INTO travel.route_operations (id, trip_id, initiator_user_id, kind, status, expected_trip_revision_id,
         expected_publication_id, idempotency_key, request_fingerprint, result_trip_revision_id, finished_at)
         VALUES ($1,$2,$3,'unpublish','succeeded',$4,$5,$6,$7,$8,clock_timestamp())`,
        [id, tripId, editor.userId, trip.trip_revision_id, trip.publication_id, key, hash, revision],
      );
      return { publication_id: null, trip_revision_id: revision };
    });
  }

  archive(editor: TravelEditor, tripId: string, key: string, command: { trip_revision_id: string }) {
    const hash = fingerprint(command);
    return this.database.transaction(async (client) => {
      const trip = await publicationTrip(client, tripId, editor.userId);
      await editor.confirmSession();
      const { rows: [prior] } = await client.query<{ request_fingerprint: string; response: { publication_id: null; trip_revision_id: string } }>(
        `SELECT request_fingerprint, response FROM travel.draft_commands
         WHERE actor_user_id = $1 AND action = 'trip.archive' AND target_id = $2 AND idempotency_key = $3`,
        [editor.userId, tripId, key],
      );
      if (prior) {
        if (prior.request_fingerprint !== hash) {
          throw new BffProblem('IDEMPOTENCY_KEY_REUSED');
        }
        return prior.response;
      }
      if (trip.archived_at) {
        throw new BffProblem('NOT_FOUND');
      }
      checkRevision(trip, command.trip_revision_id);
      const revision = await revokePublication(client, trip, editor.userId, key, 'archive');
      const response = { publication_id: null, trip_revision_id: revision };
      await client.query(
        `INSERT INTO travel.draft_commands (actor_user_id, action, target_id, idempotency_key, request_fingerprint, trip_id, response)
         VALUES ($1,'trip.archive',$2,$3,$4,$2,$5)`, [editor.userId, tripId, key, hash, response],
      );
      await client.query(
        `INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action, object_id) VALUES ($1,$2,'trip.archive',$1)`,
        [tripId, editor.userId],
      );
      return response;
    });
  }

  private async pending<T>(
    job: Job, execute: (client: PoolClient, trip: PublicationTrip, op: Operation) => Promise<T>,
  ) {
    return this.database.transaction(async (client) => {
      const trip = await publicationTrip(client, job.trip_id);
      const { rows: [op] } = await client.query<Operation>(
        `SELECT ${operationColumns} FROM travel.route_operations o WHERE o.id = $1 AND o.trip_id = $2 FOR UPDATE OF o`,
        [job.id, job.trip_id],
      );
      if (!op || op.status !== 'pending') {
        return null;
      }
      const failure = op.expired
        ? 'PUBLICATION_TIMED_OUT'
        : trip.archived_at || trip.visibility !== 'public' || trip.owner_user_id !== op.initiator_user_id
          ? 'PUBLICATION_PRECONDITION_FAILED'
          : trip.trip_revision_id !== op.expected_trip_revision_id || trip.publication_id !== op.expected_publication_id
            ? 'TRIP_REVISION_CONFLICT'
            : null;
      if (failure) {
        await failPending(client, trip.trip_id, failure, job.id);
        return null;
      }
      return execute(client, trip, op);
    });
  }

  manifest(job: Job) {
    return this.pending(job, async (client) => {
      const { rows: [manifest] } = await client.query<GeoManifest>(
        `SELECT o.id AS "operationId", o.trip_id AS "tripId", ${manifestColumns('o.id')}
         FROM travel.route_operations o WHERE o.id = $1 AND o.manifest_sealed_at IS NOT NULL`, [job.id],
      );
      if (!manifest) {
        throw new BffProblem('DEPENDENCY_UNAVAILABLE');
      }
      return manifest;
    });
  }

  fail(job: Job, code: string) {
    return this.pending(job, client => failPending(client, job.trip_id, code, job.id));
  }

  commit(job: Job, verified: Verified) {
    return this.pending(job, async (client, trip, op) => {
      const draft = await getDraft(client, trip.owner_user_id, trip.trip_id);
      const { rows: [state] } = await client.query<{ lifecycle: string; version: string; confirmed_participants: number }>(
        `SELECT lifecycle, version + 1 AS version, seats.confirmed_participants FROM travel.trips t ${participantCountSql} WHERE t.id = $1`, [trip.trip_id],
      );
      if (draft.free_capacity !== null && state!.confirmed_participants > draft.free_capacity) {
        await failPending(client, trip.trip_id, 'PUBLICATION_PRECONDITION_FAILED', job.id);
        return;
      }
      const snapshot = {
        title: draft.title,
        description: draft.description,
        start_date: draft.start_date,
        end_date: draft.end_date,
        timezone: draft.timezone,
        free_capacity: draft.free_capacity,
        difficulty: draft.difficulty,
        participation_rules: draft.participation_rules,
        admission_mode: draft.admission_mode,
        equipment: draft.equipment,
        lifecycle: state!.lifecycle,
        trip_type: verified.tripType,
        days: draft.days.map(({ position, local_date, description }) => ({ position, local_date, description })),
      };
      const publicationId = randomUUID();
      const revision = randomUUID();
      const { rowCount } = await client.query(
        `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
         UPDATE travel.route_operations SET status = 'succeeded', finished_at = instant.at, result_trip_revision_id = $2
         FROM instant WHERE id = $1 AND instant.at < deadline_at`, [job.id, revision],
      );
      if (!rowCount) {
        await failPending(client, trip.trip_id, 'PUBLICATION_TIMED_OUT', job.id);
        return;
      }
      await client.query(
        `INSERT INTO travel.trip_versions (publication_id, trip_id, trip_version, operation_id, snapshot, cover_id)
         VALUES ($1,$2,$3,$4,$5,$6)`, [publicationId, trip.trip_id, state!.version, job.id, snapshot, draft.cover_id],
      );
      await client.query(
        `UPDATE travel.trips SET publication_id = $2, trip_revision_id = $3, version = version + 1,
         access_generation = access_generation + 1, updated_at = greatest(updated_at, clock_timestamp()) WHERE id = $1`,
        [trip.trip_id, publicationId, revision],
      );
      await client.query(
        `INSERT INTO travel.trip_catalog_entries (trip_id, publication_id, start_geog, search_text, first_local_date, trip_type, difficulty)
         VALUES ($1,$2,public.ST_SetSRID(public.ST_MakePoint($3,$4),4326)::public.geography,$5,$6,$7,$8)
         ON CONFLICT (trip_id) DO UPDATE SET publication_id = EXCLUDED.publication_id, start_geog = EXCLUDED.start_geog,
           search_text = EXCLUDED.search_text, first_local_date = EXCLUDED.first_local_date,
           trip_type = EXCLUDED.trip_type, difficulty = EXCLUDED.difficulty`,
        [trip.trip_id, publicationId, verified.start.lon, verified.start.lat, draft.title, draft.start_date, verified.tripType, draft.difficulty],
      );
      await publicationEvent(client, trip.trip_id, op.initiator_user_id, job.id, 'trip.published', publicationId);
    });
  }
}
