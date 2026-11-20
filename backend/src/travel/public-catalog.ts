import {
  Inject,
  Injectable,
} from '@nestjs/common';
import type { GeoManifest } from '../geo/publication/geo-publication.service.js';
import type {
  catalogInput,
  CatalogPosition,
} from '../publication/publication-input.js';
import { manifestColumns } from './publication-state.js';
import { TravelDatabase } from './travel-database.js';
import type { AdmissionMode } from './travel-input.js';
import {
  applicationsOpenSql,
  participantCountSql,
} from './trip-applications.js';

interface Snapshot {
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  difficulty: string | null;
  free_capacity: number | null;
  admission_mode?: AdmissionMode;
  trip_type: 'foot' | 'bicycle' | 'car' | 'combined' | null;
  lifecycle: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  days: { position: number; local_date: string | null; description: string | null }[];
}

export interface Candidate extends GeoManifest {
  ownerId: string;
  applications_open: boolean;
  confirmed_participants: number;
  publication_id: string;
  access_generation: string;
  snapshot: Snapshot;
}

interface FilterOption {
  value: string;
  label: string;
}

const candidateQuery = (distance = '0') => `SELECT ${distance} AS distance_m, t.id AS "tripId", t.owner_user_id AS "ownerId", t.access_generation, v.publication_id, v.operation_id AS "operationId",
  v.snapshot, seats.confirmed_participants, ${applicationsOpenSql} AS applications_open, ${manifestColumns('v.operation_id')}
  FROM travel.trip_catalog_entries c JOIN travel.trips t ON (t.id,t.publication_id) = (c.trip_id,c.publication_id)
  JOIN travel.trip_versions v ON (v.trip_id,v.publication_id) = (t.id,t.publication_id)
  ${participantCountSql}
  WHERE t.visibility = 'public' AND t.archived_at IS NULL`;

@Injectable()
export class PublicCatalog {
  constructor(@Inject(TravelDatabase) private readonly database: TravelDatabase) {}

  filterOptions() {
    return this.database.transaction(async (client) => {
      const regions = await client.query<FilterOption>('SELECT code AS value, label FROM travel.catalog_regions ORDER BY label, code');
      const difficulties = await client.query<FilterOption>('SELECT code AS value, label FROM travel.catalog_difficulties ORDER BY position');
      return { regions: regions.rows, difficulties: difficulties.rows };
    });
  }

  candidate(id: string) {
    return this.database.transaction(async (client) => {
      const { rows: [row] } = await client.query<Candidate>(`${candidateQuery()} AND t.id = $1`, [id]);
      return row;
    });
  }

  participationForViewer(userId: string, ids: string[]) {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<Candidate & { participation: 'pending' | 'joined' }>(
        `SELECT candidate.*, membership.participation FROM (
           SELECT trip_id, 'pending' AS participation FROM travel.trip_applications
           WHERE applicant_user_id = $1 AND trip_id = ANY($2::uuid[]) AND status = 'pending'
           UNION ALL SELECT trip_id, 'joined' FROM travel.trip_participants
           WHERE user_id = $1 AND trip_id = ANY($2::uuid[]) AND status = 'confirmed'
         ) membership JOIN (${candidateQuery()}) candidate ON candidate."tripId" = membership.trip_id
         ORDER BY membership.trip_id`, [userId, ids],
      );
      return rows;
    });
  }

  candidates(filters: ReturnType<typeof catalogInput>['filters'], after: CatalogPosition | null, limit: number) {
    const { q, types, start, end, difficulty, bbox, near, radius, region } = filters;
    return this.database.transaction(async (client) => {
      const origin = 'public.ST_SetSRID(public.ST_MakePoint(($9::float8[])[1], ($9::float8[])[2]), 4326)::public.geography';
      const distance = `COALESCE(round(public.ST_Distance(c.start_geog, ${origin}))::int, 0)`;
      const { rows } = await client.query<Candidate & { distance_m: number }>(
        `SELECT * FROM (${candidateQuery(distance)}
         AND ($2::text IS NULL OR strpos(lower(c.search_text), lower($2)) > 0)
         AND (cardinality($3::text[]) = 0 OR c.trip_type = ANY($3))
         AND ($4::date IS NULL OR COALESCE((v.snapshot->>'end_date')::date, c.first_local_date) >= $4)
         AND ($5::date IS NULL OR c.first_local_date <= $5)
         AND ($6::text IS NULL OR c.difficulty = $6 OR (c.difficulty IS NOT NULL AND $6 = COALESCE((
           SELECT difficulty_code FROM travel.catalog_difficulty_aliases
           WHERE alias = replace(lower(c.difficulty), 'ё', 'е')
         ), 'other')))
         AND ($7::float8[] IS NULL OR (
           public.ST_X(c.start_geog::public.geometry) BETWEEN ($7)[1] AND ($7)[3]
           AND public.ST_Y(c.start_geog::public.geometry) BETWEEN ($7)[2] AND ($7)[4]))
         AND ($10::float8 IS NULL OR public.ST_DWithin(c.start_geog, ${origin}, $10 * 1000))
         AND ($12::text IS NULL OR EXISTS (
           SELECT FROM travel.catalog_regions r WHERE r.code = $12
           AND public.ST_Covers(r.boundary, c.start_geog::public.geometry)
         ))
         ) candidates
         WHERE ($1::uuid IS NULL OR (distance_m, "tripId") > ($11::int, $1::uuid))
         ORDER BY distance_m, "tripId" LIMIT $8`,
        [after?.id, q, types, start, end, difficulty, bbox, limit, near, radius, after?.distance, region],
      );
      return rows;
    });
  }

  confirm(candidates: Candidate[]) {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<{ id: string; ownerId: string; publication_id: string; access_generation: string }>(
        `SELECT id, owner_user_id AS "ownerId", publication_id, access_generation FROM travel.trips
         WHERE id = ANY($1::uuid[]) AND visibility = 'public' AND archived_at IS NULL AND publication_id IS NOT NULL`,
        [candidates.map(candidate => candidate.tripId)],
      );
      return new Map(rows.map(row => [row.id, row]));
    });
  }
}
