import { BffProblem } from '../../http/bff-problem.js';
import { uuid } from '../../identity/identity-input.js';
import {
  fields,
  requiredText,
} from '../travel-input.js';

export type GroupReference = { id: string } | { label: string };

export interface PersonalEquipmentInput {
  label: string;
  scope?: 'personal';
  group?: GroupReference;
  subgroup?: GroupReference;
  icon?: string;
}

const icons = new Set([
  'documents', 'clothing', 'hygiene', 'health', 'electronics', 'bags', 'food', 'orientation', 'camp',
  'cooking', 'hiking', 'cycling', 'car', 'water', 'winter', 'city', 'family', 'other',
]);

function labelOf(value: unknown) {
  return requiredText(typeof value === 'string' ? value.trim() : value, 120);
}

function referenceOf(value: unknown): GroupReference {
  const ref = fields(value, ['id', 'label']);
  if (Object.keys(ref).length !== 1) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return 'id' in ref ? { id: uuid(ref.id).toLowerCase() } : { label: labelOf(ref.label) };
}

export function parsePersonalEquipment(value: unknown): PersonalEquipmentInput {
  const body = fields(value, ['label', 'scope', 'group', 'subgroup', 'icon']);
  if ('subgroup' in body && !('group' in body)) {
    throw new BffProblem('INVALID_REQUEST');
  }
  const result: PersonalEquipmentInput = { label: labelOf(body.label) };
  if ('scope' in body) {
    if (body.scope !== 'personal') {
      throw new BffProblem('INVALID_REQUEST');
    }
    result.scope = body.scope;
  }
  if ('icon' in body) {
    if (typeof body.icon !== 'string' || !icons.has(body.icon)) {
      throw new BffProblem('INVALID_REQUEST');
    }
    result.icon = body.icon;
  }
  if ('group' in body) {
    result.group = referenceOf(body.group);
  }
  if ('subgroup' in body) {
    result.subgroup = referenceOf(body.subgroup);
  }
  return result;
}
