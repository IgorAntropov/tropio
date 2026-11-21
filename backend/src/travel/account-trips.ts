import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { BffProblem } from '../http/bff-problem.js';
import {
  type Candidate,
  candidateQuery,
  startingSoonSql,
} from './public-catalog.js';
import { TravelDatabase } from './travel-database.js';
import type { accountTripsInput } from './travel-input.js';
import type { TravelEditor } from './travel.service.js';
import {
  activeCapacitySql,
  participantCountSql,
} from './trip-applications.js';

export type AccountTripFilter = ReturnType<typeof accountTripsInput>;
type Participation = 'pending' | 'joined' | null;

export interface OwnedTrip {
  trip_id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  cover_id: string | null;
  publication_id: string | null;
  difficulty: string | null;
  free_capacity: number | null;
  lifecycle: Candidate['snapshot']['lifecycle'];
  day_count: number;
  route_ids: string[];
  archived: boolean;
  confirmed_participants: number;
  saved: boolean;
  pending_count: number;
  starting_soon: boolean;
}

export interface CollectionCandidate extends Candidate {
  saved: boolean;
  participation_status: Participation;
}

@Injectable()
export class AccountTrips {
  constructor(@Inject(TravelDatabase) private readonly database: TravelDatabase) {}

  created(userId: string, input: AccountTripFilter) {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<OwnedTrip>(
        `SELECT t.id AS trip_id, t.title, COALESCE(t.description, '') AS description,
           to_char(t.start_date, 'YYYY-MM-DD') AS start_date, to_char(t.end_date, 'YYYY-MM-DD') AS end_date,
           t.cover_id, t.publication_id, t.difficulty, ${activeCapacitySql} AS free_capacity, t.lifecycle, t.archived_at IS NOT NULL AS archived,
           seats.confirmed_participants,
           (SELECT count(*)::int FROM travel.trip_days d WHERE d.trip_id = t.id AND d.archived_at IS NULL) AS day_count,
           (SELECT count(*)::int FROM travel.trip_applications a WHERE a.trip_id = t.id AND a.status = 'pending') AS pending_count,
           ARRAY(SELECT r.id FROM travel.routes r JOIN travel.trip_days d ON (d.trip_id,d.id) = (r.trip_id,r.trip_day_id)
             WHERE r.trip_id = t.id AND r.archived_at IS NULL AND d.archived_at IS NULL ORDER BY d.position, r.id) AS route_ids,
           false AS saved, ${startingSoonSql} AS starting_soon
         FROM travel.trips t
         LEFT JOIN travel.trip_versions v ON (v.trip_id,v.publication_id) = (t.id,t.publication_id)
         ${participantCountSql}
         WHERE t.owner_user_id = $1 AND ($2::uuid IS NULL OR t.id > $2)
           AND (t.archived_at IS NOT NULL) = ($3::text = 'archived')
           AND ($3 IN ('all','archived') OR ($3 = 'draft' AND t.publication_id IS NULL)
                OR ($3 = 'published' AND t.publication_id IS NOT NULL AND t.lifecycle = 'planned' AND NOT ${startingSoonSql})
                OR ($3 = 'starting_soon' AND ${startingSoonSql}) OR (t.publication_id IS NOT NULL AND $3 = t.lifecycle))
           AND ($4 = '' OR strpos(lower(concat_ws(' ', t.title, t.description) COLLATE pg_catalog."unicode"), lower($4::text COLLATE pg_catalog."unicode")) > 0)
         ORDER BY t.id LIMIT $5`, [userId, input.cursor, input.status, input.query, input.limit + 1],
      );
      return rows;
    });
  }

  candidates(userId: string, input: AccountTripFilter, after: string | null, size: number) {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<CollectionCandidate>(
        `SELECT candidate.*, f.user_id IS NOT NULL AS saved,
           CASE WHEN p.user_id IS NOT NULL THEN 'joined' WHEN a.applicant_user_id IS NOT NULL THEN 'pending' END AS participation_status
         FROM (${candidateQuery()}) candidate
         LEFT JOIN travel.trip_favorites f ON (f.user_id, f.trip_id) = ($1, candidate."tripId")
         LEFT JOIN travel.trip_participants p ON (p.user_id, p.trip_id) = ($1, candidate."tripId") AND p.status = 'confirmed'
         LEFT JOIN travel.trip_applications a ON (a.applicant_user_id, a.trip_id) = ($1, candidate."tripId") AND a.status = 'pending'
         WHERE candidate."ownerId" <> $1 AND ($2::uuid IS NULL OR candidate."tripId" > $2)
           AND CASE $3::text
             WHEN 'favorites' THEN f.user_id IS NOT NULL
             WHEN 'joined' THEN p.user_id IS NOT NULL
             WHEN 'pending' THEN a.applicant_user_id IS NOT NULL
             WHEN 'participation' THEN p.user_id IS NOT NULL OR a.applicant_user_id IS NOT NULL
             ELSE f.user_id IS NOT NULL OR p.user_id IS NOT NULL OR a.applicant_user_id IS NOT NULL END
           AND ($4::text = 'all' OR ($4 = 'published' AND candidate.current_lifecycle = 'planned' AND NOT candidate.starting_soon)
                OR ($4 = 'starting_soon' AND candidate.starting_soon) OR $4 = candidate.current_lifecycle)
           AND ($5 = '' OR strpos(lower(concat_ws(' ', candidate.snapshot->>'title', candidate.snapshot->>'description') COLLATE pg_catalog."unicode"), lower($5::text COLLATE pg_catalog."unicode")) > 0)
         ORDER BY candidate."tripId" LIMIT $6`, [userId, after, input.collection, input.status, input.query, size],
      );
      return rows;
    });
  }

  isFavorite(userId: string, tripId: string) {
    return this.database.transaction(async (client) => {
      const row = await client.query('SELECT FROM travel.trip_favorites WHERE user_id = $1 AND trip_id = $2', [userId, tripId]);
      return !!row.rowCount;
    });
  }

  removeFavorite(editor: TravelEditor, tripId: string) {
    return this.database.transaction(async (client) => {
      await editor.confirmSession();
      await client.query(
        `WITH removed AS (
           DELETE FROM travel.trip_favorites WHERE user_id = $1 AND trip_id = $2 RETURNING trip_id, user_id
         ) INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action)
           SELECT trip_id, user_id, 'trip.favorite.remove' FROM removed`,
        [editor.userId, tripId],
      );
      return false;
    });
  }

  addFavorite(editor: TravelEditor, candidate: Candidate, confirmGeo: () => Promise<void>) {
    return this.database.transaction(async (client) => {
      const lock = await client.query<{ owner_user_id: string }>(
        `SELECT owner_user_id FROM travel.trips WHERE id = $1 AND publication_id = $2 AND access_generation = $3
         AND visibility = 'public' AND archived_at IS NULL FOR SHARE`,
        [candidate.tripId, candidate.publication_id, candidate.access_generation],
      );
      if (!lock.rowCount) {
        throw new BffProblem('NOT_FOUND');
      }
      if (lock.rows[0]?.owner_user_id === editor.userId) {
        throw new BffProblem('TRIP_FAVORITE_OWN');
      }
      await confirmGeo();
      await editor.confirmSession();
      await client.query(
        `WITH added AS (
           INSERT INTO travel.trip_favorites (user_id, trip_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING RETURNING trip_id, user_id
         ) INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action)
           SELECT trip_id, user_id, 'trip.favorite.add' FROM added`,
        [editor.userId, candidate.tripId],
      );
      return true;
    });
  }
}
