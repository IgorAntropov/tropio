import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BffProblem } from '../http/bff-problem.js';
import {
  manifestColumns,
  revokePublication,
} from './publication-state.js';
import {
  decodeCover,
  storeCover,
} from './trip-cover.js';
import type { TripCoverFile } from './trip-cover.js';
import { TravelDatabase } from './travel-database.js';
import type {
  DayFields,
  EquipmentItem,
  TripFields,
  updateTripInput,
} from './travel-input.js';

export interface TravelEditor {
  userId: string;
  confirmSession(): Promise<void>;
}

type Action = 'trip.create' | 'trip.update' | 'day.create' | 'day.update' | 'route.bind';
type EditAction = Exclude<Action, 'trip.create'>;
type Target = { kind: 'day' | 'trip'; id: string };
type DraftEdit<Fields> = { trip_revision_id: string; patch: Partial<Fields> };
type Dates = Pick<TripFields, 'start_date' | 'end_date'>;
type TripWriteFields = Omit<TripFields, 'equipment' | 'cover'>;

interface TripSummary extends Dates {
  cover_id: string | null;
  admission_mode: TripFields['admission_mode'];
  trip_id: string;
  trip_revision_id: string;
  publication_id: string | null;
  visibility: 'public' | 'private';
  title: string;
}

interface TripRow extends TripSummary, TripWriteFields {}

interface DraftDay extends DayFields {
  day_id: string;
  position: number;
  route_id: string | null;
}

interface PublishedManifest {
  trip_revision_id: string;
  routes: { day_id: string; route_id: string; route_revision_id: string }[];
  poi_count: number;
}

interface TripDraft extends TripRow {
  published_manifest?: PublishedManifest;
  equipment: EquipmentItem[];
  days: DraftDay[];
}

interface Receipt {
  trip_id: string;
  request_fingerprint: string;
  response: TripDraft;
}

interface Command {
  actorId: string;
  action: Action;
  targetId: string;
  key: string;
  fingerprint: string;
}

const summaryColumns = `
  t.id AS trip_id, t.trip_revision_id, t.publication_id, t.visibility, t.title, t.admission_mode, t.cover_id,
  to_char(t.start_date, 'YYYY-MM-DD') AS start_date, to_char(t.end_date, 'YYYY-MM-DD') AS end_date
`;

const draftColumns = `
  ${summaryColumns}, t.description, t.timezone, t.free_capacity, t.difficulty, t.participation_rules
`;

const dayColumns = `
  d.id AS day_id, d.position, to_char(d.local_date, 'YYYY-MM-DD') AS local_date, d.description, d.notes
`;

function makeCommand(actorId: string, action: Action, targetId: string, key: string, input: object): Command {
  return {
    actorId,
    action,
    targetId,
    key,
    fingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
  };
}

function uniqueCommandKey({ actorId, action, targetId, key }: Command) {
  return [actorId, action, targetId, key];
}

async function getPrior(client: PoolClient, command: Command): Promise<Receipt | undefined> {
  const { rows: [receipt] } = await client.query<Receipt>(
    `SELECT trip_id, request_fingerprint, response FROM travel.draft_commands
     WHERE actor_user_id = $1 AND action = $2 AND target_id = $3 AND idempotency_key = $4`,
    uniqueCommandKey(command),
  );
  if (receipt && receipt.request_fingerprint !== command.fingerprint) {
    throw new BffProblem('IDEMPOTENCY_KEY_REUSED');
  }
  return receipt;
}

async function storeReceipt(client: PoolClient, command: Command, draft: TripDraft): Promise<void> {
  await client.query(
    `INSERT INTO travel.draft_commands
       (actor_user_id, action, target_id, idempotency_key, request_fingerprint, trip_id, response)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [...uniqueCommandKey(command), command.fingerprint, draft.trip_id, JSON.stringify(draft)],
  );
}

export async function getDraft(client: PoolClient, ownerId: string, id: string): Promise<TripDraft> {
  const { rows: [row] } = await client.query<Omit<TripDraft, 'published_manifest'> & { published_manifest: PublishedManifest | null }>(
    `SELECT ${draftColumns},
      (SELECT jsonb_build_object('trip_revision_id', o.result_trip_revision_id, 'routes', m.routes, 'poi_count', cardinality(m."poiIds"))
       FROM travel.trip_versions v JOIN travel.route_operations o ON o.id = v.operation_id
       CROSS JOIN LATERAL (SELECT ${manifestColumns('o.id')}) m
       WHERE (v.trip_id,v.publication_id) = (t.id,t.publication_id)) AS published_manifest,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', e.label, 'required', e.required) ORDER BY e.position)
        FROM travel.trip_equipment e
        WHERE e.trip_id = t.id
      ), '[]'::jsonb) AS equipment,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(day) ORDER BY day.position)
        FROM (
          SELECT ${dayColumns}, r.id AS route_id
          FROM travel.trip_days d
          LEFT JOIN travel.routes r ON r.trip_id = d.trip_id AND r.trip_day_id = d.id AND r.archived_at IS NULL
          WHERE d.trip_id = t.id AND d.archived_at IS NULL
        ) AS day
      ), '[]'::jsonb) AS days
     FROM travel.trips t
     WHERE t.id = $1 AND t.owner_user_id = $2 AND t.archived_at IS NULL`,
    [id, ownerId],
  );
  if (!row) {
    throw new BffProblem('NOT_FOUND');
  }
  const { published_manifest, ...draft } = row;
  return published_manifest ? { ...draft, published_manifest } : draft;
}

async function lockTrip(client: PoolClient, ownerId: string, target: Target): Promise<TripRow> {
  const { rows: [trip] } = await client.query<TripRow>(
    `SELECT ${draftColumns}
     FROM travel.trips t
     ${target.kind === 'day' ? 'JOIN travel.trip_days d ON d.trip_id = t.id AND d.archived_at IS NULL' : ''}
     WHERE ${target.kind === 'day' ? 'd.id' : 't.id'} = $1
       AND t.owner_user_id = $2 AND t.archived_at IS NULL
     FOR UPDATE OF t`,
    [target.id, ownerId],
  );
  if (!trip) {
    throw new BffProblem('NOT_FOUND');
  }
  return trip;
}

async function getDay(client: PoolClient, tripId: string, dayId: string): Promise<Omit<DraftDay, 'route_id'>> {
  const { rows: [day] } = await client.query<Omit<DraftDay, 'route_id'>>(
    `SELECT ${dayColumns} FROM travel.trip_days d
     WHERE d.trip_id = $1 AND d.id = $2 AND d.archived_at IS NULL`,
    [tripId, dayId],
  );
  if (!day) {
    throw new BffProblem('NOT_FOUND');
  }
  return day;
}

async function insertEquipment(client: PoolClient, tripId: string, equipment: EquipmentItem[]): Promise<void> {
  if (!equipment.length) {
    return;
  }

  await client.query(
    `INSERT INTO travel.trip_equipment (trip_id, position, label, required)
     SELECT $1, entry.position, entry.item->>'label', (entry.item->>'required')::boolean
     FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS entry(item, position)`,
    [tripId, JSON.stringify(equipment)],
  );
}

function assertTripDates({ start_date: start, end_date: end }: Dates): void {
  if (end && (!start || end < start)) {
    throw new BffProblem('INVALID_TRIP_DATES');
  }
}

function assertDayDate({ start_date: start, end_date: end }: Dates, localDate: string | null): void {
  if (start && localDate && (localDate < start || localDate > (end ?? start))) {
    throw new BffProblem('INVALID_TRIP_DATES');
  }
}

async function updateDayDates(client: PoolClient, tripId: string, dates: Dates, shiftFrom?: string | null): Promise<void> {
  if (!dates.start_date) {
    return;
  }

  const { rowCount } = await client.query(
    `SELECT 1 FROM travel.trip_days
     WHERE trip_id = $1 AND archived_at IS NULL
       AND local_date NOT BETWEEN $2::date AND $2::date + ($4::date - $3::date)
     LIMIT 1`,
    [tripId, shiftFrom ?? dates.start_date, dates.start_date, dates.end_date ?? dates.start_date],
  );
  if (rowCount) {
    throw new BffProblem('INVALID_TRIP_DATES');
  }
  if (shiftFrom) {
    await client.query(
      `UPDATE travel.trip_days SET local_date = $3::date + (local_date - $2::date)
       WHERE trip_id = $1 AND archived_at IS NULL AND local_date IS NOT NULL`,
      [tripId, shiftFrom, dates.start_date],
    );
  }
}

async function audit(client: PoolClient, tripId: string, command: Command, objectId: string): Promise<void> {
  await client.query(
    `INSERT INTO travel.trip_audit_events (trip_id, actor_user_id, action, object_id) VALUES ($1, $2, $3, $4)`,
    [tripId, command.actorId, command.action, objectId],
  );
}

@Injectable()
export class TravelService {
  constructor(@Inject(TravelDatabase) private readonly database: TravelDatabase) {}

  async canEditTrip(ownerId: string, tripId: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const { rowCount } = await client.query(
        'SELECT 1 FROM travel.trips WHERE id = $1 AND owner_user_id = $2 AND archived_at IS NULL',
        [tripId, ownerId],
      );
      return rowCount === 1;
    });
  }

  async routeTrip(ownerId: string, routeId: string): Promise<string> {
    return this.database.transaction(async (client) => {
      const { rows: [route] } = await client.query<{ trip_id: string }>(
        `SELECT r.trip_id FROM travel.routes r
         JOIN travel.trip_days d ON d.trip_id = r.trip_id AND d.id = r.trip_day_id
         JOIN travel.trips t ON t.id = d.trip_id
         WHERE r.id = $1 AND t.owner_user_id = $2
           AND r.archived_at IS NULL AND d.archived_at IS NULL AND t.archived_at IS NULL`,
        [routeId, ownerId],
      );
      if (!route) {
        throw new BffProblem('NOT_FOUND');
      }
      return route.trip_id;
    });
  }

  async tripRouteIds(ownerId: string, tripId: string): Promise<string[]> {
    return this.database.transaction(async (client) => {
      const { rows: [trip] } = await client.query<{ route_ids: string[] }>(
        `SELECT ARRAY(
           SELECT r.id FROM travel.routes r
           JOIN travel.trip_days d ON d.trip_id = r.trip_id AND d.id = r.trip_day_id
           WHERE r.trip_id = t.id AND r.archived_at IS NULL AND d.archived_at IS NULL
           ORDER BY d.position
         ) AS route_ids
         FROM travel.trips t WHERE t.id = $1 AND t.owner_user_id = $2 AND t.archived_at IS NULL`,
        [tripId, ownerId],
      );
      if (!trip) {
        throw new BffProblem('NOT_FOUND');
      }
      return trip.route_ids;
    });
  }

  async listTrips(ownerId: string, input: { limit: number; cursor: string | null }) {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<TripSummary>(
        `SELECT ${summaryColumns}
         FROM travel.trips t
         WHERE t.owner_user_id = $1 AND t.archived_at IS NULL AND ($2::uuid IS NULL OR t.id > $2::uuid)
         ORDER BY t.id
         LIMIT $3`,
        [ownerId, input.cursor, input.limit + 1],
      );
      const items = rows.slice(0, input.limit);
      const next_cursor = rows.length > input.limit ? items.at(-1)?.trip_id ?? null : null;
      return { items, next_cursor };
    });
  }

  async draftCover(ownerId: string, tripId: string, coverId: string) {
    return this.database.transaction(async (client) => {
      const { rows: [image] } = await client.query<TripCoverFile>(
        `SELECT c.bytes, c.content_type FROM travel.trip_covers c
         JOIN travel.trips t ON (t.id, t.cover_id) = (c.trip_id, c.id)
         WHERE t.id = $1 AND t.owner_user_id = $2 AND t.archived_at IS NULL AND c.id = $3`,
        [tripId, ownerId, coverId],
      );
      if (!image) {
        throw new BffProblem('NOT_FOUND');
      }
      return image;
    });
  }

  async readDraft(ownerId: string, tripId: string): Promise<TripDraft> {
    return this.database.transaction(client => getDraft(client, ownerId, tripId));
  }

  async createTrip(
    editor: TravelEditor, key: string, input: Partial<TripFields> & Pick<TripFields, 'title'>, tripId?: string,
  ): Promise<TripDraft> {
    const { title, description = null, start_date = null, end_date = null, timezone = null, free_capacity = null,
      difficulty = null, participation_rules = null, equipment = [], admission_mode = 'request' } = input;
    const cover = input.cover ? await decodeCover(input.cover) : null;
    const command = makeCommand(editor.userId, 'trip.create', editor.userId, key, {
      title,
      description,
      start_date,
      end_date,
      timezone,
      free_capacity,
      difficulty,
      participation_rules,
      equipment,
      ...(cover ? { cover: createHash('sha256').update(cover.bytes).digest('hex') } : {}),
      ...(admission_mode === 'open' ? { admission_mode } : {}),
      ...(tripId ? { trip_id: tripId } : {}),
    });

    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify(uniqueCommandKey(command))]);
      await editor.confirmSession();
      const prior = await getPrior(client, command);
      if (prior) {
        try {
          await lockTrip(client, editor.userId, { kind: 'trip', id: prior.trip_id });
        }
        catch (error) {
          if (error instanceof BffProblem && error.code === 'NOT_FOUND') {
            throw new BffProblem('IDEMPOTENCY_KEY_REUSED');
          }
          throw error;
        }
        await editor.confirmSession();
        return prior.response;
      }

      assertTripDates({ start_date, end_date });
      const { rows: [trip] } = await client.query<{ id: string }>(
        `INSERT INTO travel.trips (id, owner_user_id, created_by_user_id, title, description, start_date, end_date, timezone,
           free_capacity, difficulty, participation_rules, admission_mode)
         VALUES (COALESCE($11::uuid, gen_random_uuid()), $1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [editor.userId, title, description, start_date, end_date, timezone, free_capacity, difficulty, participation_rules, admission_mode, tripId],
      );
      if (!trip) {
        throw new BffProblem('DEPENDENCY_UNAVAILABLE');
      }

      await client.query('INSERT INTO travel.trip_days (trip_id, position, local_date) VALUES ($1, 1, $2)', [trip.id, start_date]);
      if (cover) {
        const coverId = await storeCover(client, trip.id, cover);
        await client.query('UPDATE travel.trips SET cover_id = $2 WHERE id = $1', [trip.id, coverId]);
      }
      await insertEquipment(client, trip.id, equipment);
      await audit(client, trip.id, command, trip.id);
      const draft = await getDraft(client, editor.userId, trip.id);
      await storeReceipt(client, command, draft);
      return draft;
    });
  }

  private async editDraft(
    editor: TravelEditor,
    target: Target,
    action: EditAction,
    key: string,
    input: { trip_revision_id: string },
    change: (client: PoolClient, trip: TripRow) => Promise<string | null>,
  ): Promise<TripDraft> {
    const command = makeCommand(editor.userId, action, target.id, key, input);

    return this.database.transaction(async (client) => {
      const trip = await lockTrip(client, editor.userId, target);
      await editor.confirmSession();
      if (target.kind === 'day') {
        await getDay(client, trip.trip_id, target.id);
      }

      const prior = await getPrior(client, command);
      if (prior) {
        if (prior.trip_id !== trip.trip_id) {
          throw new BffProblem('IDEMPOTENCY_KEY_REUSED');
        }
        return prior.response;
      }

      if (trip.trip_revision_id !== input.trip_revision_id) {
        throw new BffProblem('TRIP_REVISION_CONFLICT', { currentTripRevisionId: trip.trip_revision_id });
      }

      const changedId = await change(client, trip);
      if (changedId) {
        await client.query(
          `UPDATE travel.trips SET trip_revision_id = gen_random_uuid(), version = version + 1,
             updated_at = greatest(updated_at, clock_timestamp()) WHERE id = $1 AND trip_revision_id = $2`,
          [trip.trip_id, trip.trip_revision_id],
        );
        await audit(client, trip.trip_id, command, changedId);
      }
      const draft = await getDraft(client, editor.userId, trip.trip_id);
      await storeReceipt(client, command, draft);
      return draft;
    });
  }

  async updateTrip(editor: TravelEditor, tripId: string, key: string, input: ReturnType<typeof updateTripInput>): Promise<TripDraft> {
    const { cover: upload, equipment, ...patch } = input.patch;
    const cover = upload ? await decodeCover(upload) : upload;
    const command = cover
      ? { ...input, patch: { ...input.patch, cover: createHash('sha256').update(cover.bytes).digest('hex') } }
      : input;
    return this.editDraft(editor, { kind: 'trip', id: tripId }, 'trip.update', key, command, async (client, trip) => {
      const updated = { ...trip, ...patch };
      assertTripDates(updated);
      if (input.shift_day_dates && (!trip.start_date || trip.start_date === updated.start_date)) {
        throw new BffProblem('INVALID_TRIP_DATES');
      }
      if (patch.start_date !== undefined || patch.end_date !== undefined) {
        await updateDayDates(client, tripId, updated, input.shift_day_dates ? trip.start_date : undefined);
      }
      if (updated.visibility === 'private' && trip.visibility === 'public') {
        await revokePublication(client, trip, editor.userId, key, 'private');
      }
      await client.query(
        `UPDATE travel.trips SET title = $2, description = $3, start_date = $4, end_date = $5, timezone = $6,
           free_capacity = $7, difficulty = $8, participation_rules = $9, visibility = $10, admission_mode = $11 WHERE id = $1`,
        [tripId, updated.title, updated.description, updated.start_date, updated.end_date, updated.timezone,
          updated.free_capacity, updated.difficulty, updated.participation_rules, updated.visibility, updated.admission_mode],
      );
      if (cover !== undefined) {
        const coverId = cover ? await storeCover(client, tripId, cover) : null;
        await client.query('UPDATE travel.trips SET cover_id = $2 WHERE id = $1', [tripId, coverId]);
        if (trip.cover_id) {
          await client.query(
            `DELETE FROM travel.trip_covers c WHERE c.id = $2 AND c.trip_id = $1
             AND NOT EXISTS (SELECT FROM travel.trip_versions v WHERE (v.trip_id, v.cover_id) = (c.trip_id, c.id))`,
            [tripId, trip.cover_id],
          );
        }
      }
      if (equipment !== undefined) {
        await client.query('DELETE FROM travel.trip_equipment WHERE trip_id = $1', [tripId]);
        await insertEquipment(client, tripId, equipment);
      }
      return tripId;
    });
  }

  async createDay(editor: TravelEditor, tripId: string, key: string, input: DraftEdit<DayFields>): Promise<TripDraft> {
    const { local_date = null, description = null, notes = null } = input.patch;
    const normalized = { ...input, patch: { local_date, description, notes } };
    return this.editDraft(editor, { kind: 'trip', id: tripId }, 'day.create', key, normalized, async (client, trip) => {
      assertDayDate(trip, local_date);
      const { rows: [day] } = await client.query<{ id: string }>(
        `INSERT INTO travel.trip_days (trip_id, position, local_date, description, notes)
         SELECT $1, COALESCE(max(position), 0) + 1, $2, $3, $4
         FROM travel.trip_days WHERE trip_id = $1 AND archived_at IS NULL
         RETURNING id`,
        [tripId, local_date, description, notes],
      );
      if (!day) {
        throw new BffProblem('DEPENDENCY_UNAVAILABLE');
      }
      return day.id;
    });
  }

  async updateDay(editor: TravelEditor, dayId: string, key: string, input: DraftEdit<DayFields>): Promise<TripDraft> {
    return this.editDraft(editor, { kind: 'day', id: dayId }, 'day.update', key, input, async (client, trip) => {
      const day = await getDay(client, trip.trip_id, dayId);
      const { local_date, description, notes } = { ...day, ...input.patch };
      if (input.patch.local_date !== undefined) {
        assertDayDate(trip, local_date);
      }
      await client.query(
        'UPDATE travel.trip_days SET local_date = $3, description = $4, notes = $5 WHERE trip_id = $1 AND id = $2',
        [trip.trip_id, dayId, local_date, description, notes],
      );
      return dayId;
    });
  }

  async bindRoute(editor: TravelEditor, dayId: string, key: string, input: { trip_revision_id: string }): Promise<TripDraft> {
    return this.editDraft(editor, { kind: 'day', id: dayId }, 'route.bind', key, input, async (client, trip) => {
      const { rows: [existingRoute] } = await client.query<{ archived_at: Date | null }>(
        'SELECT archived_at FROM travel.routes WHERE trip_id = $1 AND trip_day_id = $2',
        [trip.trip_id, dayId],
      );
      if (existingRoute?.archived_at) {
        throw new BffProblem('NOT_FOUND');
      }
      if (existingRoute) {
        return null;
      }

      const { rows: [route] } = await client.query<{ id: string }>(
        'INSERT INTO travel.routes (trip_id, trip_day_id) VALUES ($1, $2) RETURNING id',
        [trip.trip_id, dayId],
      );
      if (!route) {
        throw new BffProblem('DEPENDENCY_UNAVAILABLE');
      }
      return route.id;
    });
  }
}
