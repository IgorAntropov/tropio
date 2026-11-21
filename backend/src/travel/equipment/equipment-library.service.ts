import {
  Inject,
  Injectable,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BffProblem } from '../../http/bff-problem.js';
import { TravelDatabase } from '../travel-database.js';
import type { TravelEditor } from '../travel.service.js';
import type {
  GroupReference,
  PersonalEquipmentInput,
} from './equipment-input.js';

interface EquipmentGroup { id: string; label: string }

interface EquipmentItem {
  id: string;
  label: string;
  category: string;
  scope: 'system' | 'personal';
  code?: string;
  carry_scope?: 'personal' | 'group';
  condition?: string | null;
  travel_types?: string[];
  unit?: string;
  is_active?: boolean;
  group?: EquipmentGroup;
  subgroup?: EquipmentGroup;
  icon?: string;
}

interface EquipmentCategory {
  id: string;
  label: string;
  group: string;
}

const foldedLabel = (parameter: string) => `lower(${parameter}::text COLLATE pg_catalog."unicode") COLLATE pg_catalog."default"`;

const library = `SELECT label_key, position, jsonb_build_object('id', id, 'label', label, 'scope', 'system',
    'code', code, 'category', category, 'travel_types', travel_types, 'carry_scope', carry_scope,
    'condition', condition, 'unit', unit, 'is_active', is_active) AS item
  FROM travel.equipment_catalog WHERE is_active
  UNION ALL
  SELECT p.label_key, NULL, jsonb_strip_nulls(jsonb_build_object('id', p.id, 'label', p.label, 'scope', 'personal',
    'category', 'other', 'icon', p.icon,
    'group', CASE WHEN g.id IS NOT NULL THEN jsonb_build_object('id', g.id, 'label', g.label) END,
    'subgroup', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('id', s.id, 'label', s.label) END)) AS item
  FROM travel.personal_equipment p
  LEFT JOIN travel.personal_equipment_groups g ON g.id = p.group_id AND g.owner_user_id = p.owner_user_id
  LEFT JOIN travel.personal_equipment_subgroups s ON s.id = p.subgroup_id AND s.group_id = p.group_id AND s.owner_user_id = p.owner_user_id
  WHERE p.owner_user_id = $1`;

async function resolveGroup(client: PoolClient, owner: string, reference: GroupReference, parentId?: string) {
  const table = parentId ? 'travel.personal_equipment_subgroups' : 'travel.personal_equipment_groups';
  const scope = parentId ? ' AND group_id = $3' : '';
  const byId = 'id' in reference;
  const match = byId ? 'id = $2' : `label_key = ${foldedLabel('$2')}`;
  const parameters = [owner, byId ? reference.id : reference.label];
  if (parentId) {
    parameters.push(parentId);
  }
  const { rows: [existing] } = await client.query<EquipmentGroup>(
    `SELECT id, label FROM ${table} WHERE owner_user_id = $1${scope} AND ${match}`, parameters,
  );
  if (existing) {
    return existing;
  }
  if (byId) {
    throw new BffProblem('NOT_FOUND');
  }
  const columns = parentId ? 'owner_user_id, label, group_id' : 'owner_user_id, label';
  const values = parentId ? '$1,$2,$3' : '$1,$2';
  const { rows: [created] } = await client.query<EquipmentGroup>(
    `INSERT INTO ${table} (${columns}) VALUES (${values}) RETURNING id, label`, parameters,
  );
  return created!;
}

@Injectable()
export class EquipmentLibrary {
  constructor(@Inject(TravelDatabase) private readonly database: TravelDatabase) {}

  list(userId: string) {
    return this.database.transaction(async (client) => {
      const { rows: categories } = await client.query<EquipmentCategory>(
        'SELECT code AS id, label, group_label AS "group" FROM travel.equipment_categories ORDER BY position',
      );
      const { rows } = await client.query<{ item: EquipmentItem }>(
        `SELECT item FROM (${library}) AS items ORDER BY position NULLS LAST, label_key`,
        [userId],
      );
      return { categories, items: rows.map(row => row.item) };
    });
  }

  add(editor: TravelEditor, key: string, input: PersonalEquipmentInput) {
    const { label, ...options } = input;
    const personalOnly = Object.keys(options).length > 0;
    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['travel.equipment/' + editor.userId]);
      await editor.confirmSession();
      const { rows: [previous] } = await client.query<{ matches: boolean; response: EquipmentItem }>(
        `SELECT request_label = $3 AND request_options = $4::jsonb AS matches, response
         FROM travel.equipment_commands WHERE owner_user_id = $1 AND idempotency_key = $2`,
        [editor.userId, key, label, options],
      );
      if (previous) {
        if (!previous.matches) {
          throw new BffProblem('IDEMPOTENCY_KEY_REUSED');
        }
        return previous.response;
      }

      const group = input.group && await resolveGroup(client, editor.userId, input.group);
      const subgroup = input.subgroup && group && await resolveGroup(client, editor.userId, input.subgroup, group.id);
      const { rows: [existing] } = await client.query<{ item: EquipmentItem }>(
        `SELECT item FROM (${library}) AS items
         WHERE label_key = ${foldedLabel('$2')} AND (NOT $3 OR position IS NULL)
         ORDER BY position NULLS LAST LIMIT 1`,
        [editor.userId, label, personalOnly],
      );
      let item = existing?.item;
      if (item && personalOnly && (item.group?.id !== group?.id || item.subgroup?.id !== subgroup?.id || item.icon !== input.icon)) {
        throw new BffProblem('EQUIPMENT_DETAILS_CONFLICT');
      }
      if (!item) {
        const { rows: [created] } = await client.query<{ id: string }>(
          `INSERT INTO travel.personal_equipment (owner_user_id, label, group_id, subgroup_id, icon)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [editor.userId, label, group?.id, subgroup?.id, input.icon],
        );
        item = {
          id: created!.id,
          label,
          scope: 'personal',
          category: 'other',
          ...(group && { group }),
          ...(subgroup && { subgroup }),
          ...(input.icon && { icon: input.icon }),
        };
      }
      await client.query(
        'INSERT INTO travel.equipment_commands (owner_user_id, idempotency_key, request_label, request_options, response) VALUES ($1,$2,$3,$4,$5)',
        [editor.userId, key, label, options, item],
      );
      return item;
    });
  }
}
