import {
  createHash,
  randomUUID,
} from 'node:crypto';
import {
  Inject,
  Injectable,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BffProblem } from '../../http/bff-problem.js';
import { GeoAccess } from '../geo-access.js';
import { GeoDatabase } from '../geo-database.js';
import {
  canReadPoi,
  fitsTripScope,
  PoiAccess,
} from './poi-access.js';
import {
  advanceHead,
  getPoiRow,
  insertRevision,
  listPoiRows,
  poiView,
  storePosition,
  visibilityView,
} from './poi-data.js';
import type { PoiRow } from './poi-data.js';
import type {
  PoiCreateInput,
  PoiEditInput,
  PoiListInput,
  PoiModerationInput,
  PoiRemoveInput,
  PoiScope,
  PoiVisibilityInput,
} from './poi-input.js';
import { imageType } from '../../http/image-format.js';
import { readPrivatePoiMedia } from './poi-storage.js';

type PoiView = ReturnType<typeof poiView>;
type VisibilityView = ReturnType<typeof visibilityView>;
type MutatingOperation = 'create' | 'edit' | 'visibility' | 'remove' | 'attach' | 'moderate';
type ReceiptResponse = PoiView | VisibilityView | null;

interface Receipt<T> {
  fingerprint: string;
  poi_id: string;
  source_trip_id: string | null;
  response: T;
}

interface Command {
  keys: [string, MutatingOperation, string, string, string];
  hash: string;
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function command(
  actorId: string,
  operation: MutatingOperation,
  id: string,
  key: string,
  input: unknown,
  scopeId = id,
): Command {
  return { keys: [actorId, operation, id, scopeId, key], hash: fingerprint(input) };
}

function encodeCursor(signature: string, id: string): string {
  return Buffer.from(signature + id).toString('base64url');
}

function decodeCursor(signature: string, value?: string): string | null {
  if (!value) {
    return null;
  }
  const decoded = Buffer.from(value, 'base64url').toString();
  const id = decoded.slice(signature.length);
  if (!decoded.startsWith(signature) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
    || encodeCursor(signature, id) !== value) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return id;
}

async function receipt<T extends ReceiptResponse>(client: PoolClient, cmd: Command) {
  const { rows: [previous] } = await client.query<Receipt<T>>(
    `SELECT fingerprint, poi_id, source_trip_id, response
     FROM geo.poi_commands
     WHERE actor_id = $1 AND operation = $2 AND target_id = $3 AND scope_id = $4 AND idempotency_key = $5`,
    cmd.keys,
  );
  if (previous && previous.fingerprint !== cmd.hash) {
    throw new BffProblem('IDEMPOTENCY_KEY_REUSED');
  }
  return previous;
}

async function storeReceipt(client: PoolClient, cmd: Command, row: PoiRow, response: ReceiptResponse) {
  await client.query(
    `INSERT INTO geo.poi_commands (actor_id, operation, target_id, scope_id, idempotency_key,
      fingerprint, poi_id, result_revision_id, source_trip_id, response)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [...cmd.keys, cmd.hash, row.poi_id, row.poi_revision_id, row.scope_trip_id, JSON.stringify(response)],
  );
}

async function requireCategory(client: PoolClient, id: string) {
  const { rowCount } = await client.query('SELECT FROM geo.poi_categories WHERE id = $1 AND active', [id]);
  if (!rowCount) {
    throw new BffProblem('INVALID_POI_CATEGORY');
  }
}

function requireRevision(row: PoiRow, expected: string, actorId: string) {
  if (row.poi_revision_id !== expected) {
    const details = row.author_user_id === actorId ? { currentPoiRevisionId: row.poi_revision_id } : undefined;
    throw new BffProblem('POI_REVISION_CONFLICT', details);
  }
}

function nextRevision(row: PoiRow, patch: Partial<PoiRow> = {}): PoiRow {
  return {
    ...row,
    ...patch,
    poi_revision_id: randomUUID(),
    version: (BigInt(row.version) + 1n).toString(),
  };
}

@Injectable()
export class PoiService {
  constructor(
    @Inject(GeoDatabase) private readonly database: GeoDatabase,
    @Inject(GeoAccess) private readonly access: GeoAccess,
    @Inject(PoiAccess) private readonly poiAccess: PoiAccess,
  ) {}

  async categories() {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<{ category_id: string; code: string; label: string }>(
        'SELECT id AS category_id, code, label FROM geo.poi_categories WHERE active ORDER BY code',
      );
      return { items: rows };
    });
  }

  async list(actorId: string | null, input: PoiListInput) {
    const viewer = input.scope === 'global' ? null : actorId;
    if (input.scope !== 'global' && !viewer) {
      throw new BffProblem('SESSION_REQUIRED');
    }
    const signature = fingerprint([viewer, input.scope, input.trip_id, input.bbox, input.q]);
    let after = decodeCursor(signature, input.cursor);
    const permittedTrips = new Map<string, Promise<boolean>>();
    const canReadTrip = (id: string, tripId: string) => {
      const stored = permittedTrips.get(tripId);
      if (stored) {
        return stored;
      }
      const permitted = this.access.canEditTrip(id, tripId);
      permittedTrips.set(tripId, permitted);
      return permitted;
    };
    if (viewer && input.trip_id && !await canReadTrip(viewer, input.trip_id)) {
      throw new BffProblem('NOT_FOUND');
    }

    return this.database.transaction(async (client) => {
      const items: PoiView[] = [];
      const batch = Math.max(input.limit + 1, 50);
      for (;;) {
        const candidates = await listPoiRows(client, viewer, input, after, batch);
        for (const row of candidates) {
          after = row.poi_id;
          if (input.trip_id && !fitsTripScope(row, input.trip_id)) {
            continue;
          }
          if (!await canReadPoi(row, viewer, canReadTrip)) {
            continue;
          }
          if (items.length === input.limit) {
            return { items, next_cursor: encodeCursor(signature, items[items.length - 1]!.poi_id) };
          }
          items.push(poiView(row, row.author_user_id === viewer));
        }
        if (candidates.length < batch) {
          return { items, next_cursor: null };
        }
      }
    });
  }

  private async requireReadable(client: PoolClient, actorId: string | null, poiId: string, lock?: 'share') {
    const row = await getPoiRow(client, poiId, lock);
    if (!row || !await this.poiAccess.canRead(row, actorId)) {
      throw new BffProblem('NOT_FOUND');
    }
    return row;
  }

  private async requireEditor(client: PoolClient, actorId: string, poiId: string, allowDeleted = false) {
    const row = await getPoiRow(client, poiId, 'update');
    if (!row || row.author_user_id !== actorId || (row.deleted && !allowDeleted)) {
      throw new BffProblem('NOT_FOUND');
    }
    if (row.scope_trip_id) {
      await this.access.requireTrip(actorId, row.scope_trip_id);
    }
    return row;
  }

  private async requireNewScope(actorId: string, input: PoiScope) {
    if (input.visibility === 'trip' && !await this.access.canEditTrip(actorId, input.scope_trip_id)) {
      throw new BffProblem('POI_SCOPE_RESTRICTED');
    }
  }

  private async requireReceiptScope(actorId: string, previous: Receipt<ReceiptResponse>) {
    if (previous.source_trip_id) {
      await this.access.requireTrip(actorId, previous.source_trip_id);
    }
  }

  async get(actorId: string | null, poiId: string) {
    return this.database.transaction(async (client) => {
      const row = await this.requireReadable(client, actorId, poiId);
      return poiView(row, row.author_user_id === actorId);
    });
  }

  async create(actorId: string, key: string, input: PoiCreateInput) {
    const { description, ...rest } = input;
    const cmd = command(actorId, 'create', actorId, key, { ...rest, description: description ?? null });
    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify(cmd.keys)]);
      await this.requireNewScope(actorId, input);
      const previous = await receipt<PoiView>(client, cmd);
      if (previous) {
        await this.requireEditor(client, actorId, previous.poi_id);
        await this.requireReceiptScope(actorId, previous);
        return previous.response;
      }
      await requireCategory(client, input.category_id);
      const row: PoiRow = {
        poi_id: randomUUID(),
        author_user_id: actorId,
        poi_revision_id: randomUUID(),
        position_revision_id: randomUUID(),
        approved_position_revision_id: null,
        primary_media_id: null,
        version: '1',
        category_id: input.category_id,
        name: input.name,
        description: input.description ?? null,
        source: 'manual',
        position: input.position,
        visibility: input.visibility,
        scope_trip_id: input.scope_trip_id ?? null,
        moderation_status: 'pending',
        deleted: false,
        media: [],
      };
      await client.query('INSERT INTO geo.pois (id, author_user_id, head_revision_id) VALUES ($1,$2,$3)', [
        row.poi_id, actorId, row.poi_revision_id,
      ]);
      await storePosition(client, row.poi_id, row.position_revision_id, row.position);
      await insertRevision(client, row);
      const response = poiView(row, true);
      await storeReceipt(client, cmd, row, response);
      return response;
    });
  }

  async edit(actorId: string, poiId: string, key: string, input: PoiEditInput) {
    const cmd = command(actorId, 'edit', poiId, key, input);
    return this.database.transaction(async (client) => {
      const before = await this.requireEditor(client, actorId, poiId);
      const previous = await receipt<PoiView>(client, cmd);
      if (previous) {
        await this.requireReceiptScope(actorId, previous);
        return previous.response;
      }
      requireRevision(before, input.poi_revision_id, actorId);
      if (input.category_id !== undefined && input.category_id !== before.category_id) {
        await requireCategory(client, input.category_id);
      }

      const { position, category_id, name, description } = input;
      const moved = position && (position.lon !== before.position.lon || position.lat !== before.position.lat);
      const next = nextRevision(before, {
        category_id: category_id ?? before.category_id,
        name: name ?? before.name,
        description: description === undefined ? before.description : description,
        ...(moved
          ? {
              position,
              position_revision_id: randomUUID(),
              approved_position_revision_id: null,
              moderation_status: 'pending',
            }
          : {}),
      });
      if (moved) {
        await storePosition(client, poiId, next.position_revision_id, next.position);
      }
      await advanceHead(client, next);
      const response = poiView(next, true);
      await storeReceipt(client, cmd, next, response);
      return response;
    });
  }

  async changeVisibility(actorId: string, poiId: string, key: string, input: PoiVisibilityInput) {
    const cmd = command(actorId, 'visibility', poiId, key, input);
    return this.database.transaction(async (client) => {
      const before = await this.requireEditor(client, actorId, poiId);
      await this.requireNewScope(actorId, input);
      const previous = await receipt<VisibilityView>(client, cmd);
      if (previous) {
        await this.requireReceiptScope(actorId, previous);
        return previous.response;
      }
      requireRevision(before, input.poi_revision_id, actorId);
      const scopeTripId = input.scope_trip_id ?? null;
      const changed = before.visibility !== input.visibility || before.scope_trip_id !== scopeTripId;
      const next = changed
        ? nextRevision(before, {
            visibility: input.visibility,
            scope_trip_id: scopeTripId,
            moderation_status: 'pending',
            approved_position_revision_id: null,
          })
        : before;
      if (changed) {
        await advanceHead(client, next);
      }
      const response = visibilityView(next);
      await storeReceipt(client, cmd, next, response);
      return response;
    });
  }

  async remove(actorId: string, poiId: string, key: string, input: PoiRemoveInput): Promise<void> {
    const cmd = command(actorId, 'remove', poiId, key, input);
    await this.database.transaction(async (client) => {
      const before = await this.requireEditor(client, actorId, poiId, true);
      if (await receipt<null>(client, cmd)) {
        return;
      }
      if (before.deleted) {
        throw new BffProblem('NOT_FOUND');
      }
      requireRevision(before, input.poi_revision_id, actorId);
      const next = nextRevision(before, { deleted: true, approved_position_revision_id: null, moderation_status: 'pending' });
      await advanceHead(client, next);
      await storeReceipt(client, cmd, next, null);
    });
  }

  async attach(actorId: string, tripId: string, poiId: string, key: string): Promise<void> {
    const cmd = command(actorId, 'attach', poiId, key, null, tripId);
    await this.access.requireTrip(actorId, tripId);
    await this.database.transaction(async (client) => {
      const row = await this.requireReadable(client, actorId, poiId, 'share');
      await this.access.requireTrip(actorId, tripId);
      if (!fitsTripScope(row, tripId)) {
        throw new BffProblem('POI_SCOPE_RESTRICTED');
      }
      const lock = JSON.stringify(cmd.keys);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lock]);
      if (await receipt<null>(client, cmd)) {
        return;
      }
      await client.query(
        'INSERT INTO geo.trip_pois (trip_id, poi_id, added_by_user_id) VALUES ($1,$2,$3) ON CONFLICT (trip_id, poi_id) DO NOTHING',
        [tripId, poiId, actorId],
      );
      await storeReceipt(client, cmd, row, null);
    });
  }

  async moderate(actorId: string, poiId: string, key: string, input: PoiModerationInput) {
    if (!await this.access.canModerate(actorId)) {
      throw new BffProblem('NOT_FOUND');
    }
    const cmd = command(actorId, 'moderate', poiId, key, input);
    return this.database.transaction(async (client) => {
      const before = await getPoiRow(client, poiId, 'update');
      if (!before || before.deleted || before.visibility !== 'global' || !await this.access.canModerate(actorId)) {
        throw new BffProblem('NOT_FOUND');
      }
      const previous = await receipt<VisibilityView>(client, cmd);
      if (previous) {
        return previous.response;
      }
      requireRevision(before, input.poi_revision_id, actorId);
      const next = nextRevision(before, {
        moderation_status: input.decision,
        approved_position_revision_id: input.decision === 'approved' ? before.position_revision_id : null,
      });
      await advanceHead(client, next);
      await client.query(
        'INSERT INTO geo.poi_moderation_events (poi_id, poi_revision_id, actor_user_id, decision, reason) VALUES ($1,$2,$3,$4,$5)',
        [poiId, next.poi_revision_id, actorId, input.decision, input.reason ?? null],
      );
      const response = visibilityView(next);
      await storeReceipt(client, cmd, next, response);
      return response;
    });
  }

  private async approvedMedia(actorId: string | null, poiId: string, mediaId: string) {
    return this.database.transaction(async (client) => {
      const row = await this.requireReadable(client, actorId, poiId, 'share');
      if (!row.media.some(link => link.media_id === mediaId)) {
        throw new BffProblem('NOT_FOUND');
      }
      const { rows: [media] } = await client.query<{ object_key: string; media_type: string }>(
        `SELECT object_key, media_type FROM geo.poi_media
         WHERE poi_id = $1 AND id = $2 AND moderation_status = 'approved' AND deleted_at IS NULL`, [poiId, mediaId],
      );
      const contentType = media && imageType(media.media_type);
      if (!media || !contentType) {
        throw new BffProblem('NOT_FOUND');
      }
      return { objectKey: media.object_key, contentType };
    });
  }

  async media(actorId: string | null, poiId: string, mediaId: string) {
    const expected = await this.approvedMedia(actorId, poiId, mediaId);
    const bytes = await readPrivatePoiMedia(expected.objectKey, expected.contentType);
    const current = await this.approvedMedia(actorId, poiId, mediaId);
    if (current.objectKey !== expected.objectKey || current.contentType !== expected.contentType) {
      throw new BffProblem('NOT_FOUND');
    }
    return { contentType: current.contentType, bytes };
  }
}
