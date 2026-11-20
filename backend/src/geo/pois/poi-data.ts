import type { PoolClient } from 'pg';
import type {
  PoiListInput,
  PoiPosition,
  PoiScope,
} from './poi-input.js';

export type ModerationStatus = 'pending' | 'approved' | 'rejected';

interface MediaLink {
  media_id: string;
  href: string;
}

export interface PoiRow {
  poi_id: string;
  author_user_id: string;
  poi_revision_id: string;
  version: string;
  position_revision_id: string;
  approved_position_revision_id: string | null;
  category_id: string;
  name: string;
  description: string | null;
  source: string;
  position: PoiPosition;
  visibility: PoiScope['visibility'];
  scope_trip_id: string | null;
  moderation_status: ModerationStatus;
  primary_media_id: string | null;
  deleted: boolean;
  media: MediaLink[];
}

const candidate = `
SELECT p.id AS poi_id, p.author_user_id, r.id AS poi_revision_id, r.version,
       r.position_revision_id, r.approved_position_revision_id, r.category_id, r.name, r.description, r.source,
       jsonb_build_object('lon', public.ST_X(pos.geom), 'lat', public.ST_Y(pos.geom)) AS position,
       r.visibility, r.scope_trip_id, r.moderation_status, r.primary_media_id, r.deleted_at IS NOT NULL AS deleted,
       coalesce((
         SELECT jsonb_agg(
           jsonb_build_object('media_id', m.id, 'href', '/api/v1/pois/' || p.id || '/media/' || m.id)
           ORDER BY m.position
         )
         FROM geo.poi_media m
         WHERE m.poi_id = p.id AND m.deleted_at IS NULL AND m.moderation_status = 'approved'
           AND m.media_type IN ('image/png', 'image/jpeg', 'image/webp')
       ), '[]'::jsonb) AS media
FROM geo.pois p
JOIN geo.poi_revisions r ON r.poi_id = p.id AND r.id = p.head_revision_id
JOIN geo.poi_position_revisions pos ON pos.poi_id = p.id AND pos.id = r.position_revision_id
`;

export async function getPoiRow(client: PoolClient, poiId: string, lock?: 'share' | 'update') {
  if (lock) {
    const { rowCount } = await client.query(
      `SELECT id FROM geo.pois WHERE id = $1 ${lock === 'share' ? 'FOR SHARE' : 'FOR UPDATE'}`,
      [poiId],
    );
    if (!rowCount) {
      return undefined;
    }
  }
  const { rows: [row] } = await client.query<PoiRow>(`${candidate} WHERE p.id = $1`, [poiId]);
  return row;
}

export async function listPoiRows(
  client: PoolClient,
  actorId: string | null,
  input: PoiListInput,
  after: string | null,
  batch: number,
) {
  const { scope, trip_id: tripId, q, bbox } = input;
  const { rows } = await client.query<PoiRow>(
    `${candidate}
    WHERE r.deleted_at IS NULL
      AND ($1::uuid IS NULL OR p.id > $1)
      AND (
        ($2::text = 'global' AND r.visibility = 'global' AND r.moderation_status = 'approved'
          AND r.approved_position_revision_id = r.position_revision_id)
        OR ($2 = 'mine' AND p.author_user_id = $3::uuid)
        OR ($2 = 'trip' AND (r.scope_trip_id = $4::uuid OR EXISTS (
          SELECT FROM geo.trip_pois tp WHERE tp.trip_id = $4::uuid AND tp.poi_id = p.id
        )))
      )
      AND ($5::text IS NULL OR strpos(lower(r.name), lower($5)) > 0)
      AND ($6::float8 IS NULL OR pos.geom OPERATOR(public.&&) public.ST_MakeEnvelope($6, $7, $8, $9, 4326))
    ORDER BY p.id LIMIT $10`,
    [after, scope, actorId, tripId ?? null, q ?? null, ...(bbox ?? [null, null, null, null]), batch],
  );
  return rows;
}

export function poiView(row: PoiRow, editable: boolean) {
  return {
    poi_id: row.poi_id,
    category_id: row.category_id,
    name: row.name,
    ...(row.description !== null ? { description: row.description } : {}),
    position: row.position,
    ...(editable
      ? {
          poi_revision_id: row.poi_revision_id,
          visibility: row.visibility,
          moderation_status: row.moderation_status,
          ...(row.scope_trip_id ? { scope_trip_id: row.scope_trip_id } : {}),
        }
      : {}),
    media: row.media,
  };
}

export function visibilityView(row: PoiRow) {
  return {
    poi_id: row.poi_id,
    poi_revision_id: row.poi_revision_id,
    visibility: row.visibility,
    moderation_status: row.moderation_status,
  };
}

export async function storePosition(client: PoolClient, poiId: string, id: string, position: PoiPosition) {
  await client.query(
    'INSERT INTO geo.poi_position_revisions (poi_id, id, geom) VALUES ($1, $2, public.ST_SetSRID(public.ST_MakePoint($3,$4),4326))',
    [poiId, id, position.lon, position.lat],
  );
}

export async function insertRevision(client: PoolClient, row: PoiRow) {
  await client.query(
    `INSERT INTO geo.poi_revisions (
       poi_id, id, version, position_revision_id, approved_position_revision_id,
       category_id, name, description, source, visibility, scope_trip_id,
       moderation_status, primary_media_id, deleted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CASE WHEN $14 THEN now() END)`,
    [row.poi_id, row.poi_revision_id, row.version, row.position_revision_id, row.approved_position_revision_id,
      row.category_id, row.name, row.description, row.source, row.visibility, row.scope_trip_id, row.moderation_status,
      row.primary_media_id, row.deleted],
  );
}

export async function advanceHead(client: PoolClient, row: PoiRow) {
  await insertRevision(client, row);
  await client.query('UPDATE geo.pois SET head_revision_id = $2 WHERE id = $1', [row.poi_id, row.poi_revision_id]);
}
