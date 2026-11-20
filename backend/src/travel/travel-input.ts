import { BffProblem } from '../http/bff-problem.js';
import { uuid } from '../identity/identity-input.js';

export interface EquipmentItem {
  label: string;
  required: boolean;
}

export type AdmissionMode = 'request' | 'open';

export function admissionMode(value: unknown): AdmissionMode {
  if (value !== 'request' && value !== 'open') {
    throw new BffProblem('INVALID_REQUEST');
  }
  return value;
}

export interface TripFields {
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
  free_capacity: number | null;
  difficulty: string | null;
  participation_rules: string | null;
  admission_mode: AdmissionMode;
  equipment: EquipmentItem[];
}

export interface DayFields {
  local_date: string | null;
  description: string | null;
  notes: string | null;
}

const tripKeys = [
  'title', 'description', 'start_date', 'end_date', 'timezone', 'free_capacity',
  'difficulty', 'participation_rules', 'equipment', 'admission_mode',
];
const dayKeys = ['local_date', 'description', 'notes'];

export function fields(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || Array.from(value).length > maximum
    || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return value.trim();
}

function requiredText(value: unknown, maximum: number): string {
  const text = cleanText(value, maximum);
  if (!text) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return text;
}

function nullableText(value: unknown, maximum: number): string | null {
  return value === null ? null : cleanText(value, maximum) || null;
}

export function date(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BffProblem('INVALID_REQUEST');
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || day < 1 || day > (days[month - 1] ?? 0)) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return value;
}

function timezone(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  const name = requiredText(value, 100);
  if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(name)) {
    throw new BffProblem('INVALID_REQUEST');
  }
  try {
    new Intl.DateTimeFormat('ru', { timeZone: name });
  }
  catch {
    throw new BffProblem('INVALID_REQUEST');
  }
  return name;
}

function capacity(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return value;
}

function equipment(value: unknown): EquipmentItem[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return value.map((item) => {
    const input = fields(item, ['label', 'required']);
    if (typeof input.required !== 'boolean') {
      throw new BffProblem('INVALID_REQUEST');
    }
    return { label: requiredText(input.label, 120), required: input.required };
  });
}

function tripFields(input: Record<string, unknown>): Partial<TripFields> {
  const result: Partial<TripFields> = {};
  if (Object.hasOwn(input, 'title')) {
    result.title = requiredText(input.title, 120);
  }
  if (Object.hasOwn(input, 'description')) {
    result.description = nullableText(input.description, 4000);
  }
  if (Object.hasOwn(input, 'start_date')) {
    result.start_date = date(input.start_date);
  }
  if (Object.hasOwn(input, 'end_date')) {
    result.end_date = date(input.end_date);
  }
  if (Object.hasOwn(input, 'timezone')) {
    result.timezone = timezone(input.timezone);
  }
  if (Object.hasOwn(input, 'free_capacity')) {
    result.free_capacity = capacity(input.free_capacity);
  }
  if (Object.hasOwn(input, 'difficulty')) {
    result.difficulty = nullableText(input.difficulty, 80);
  }
  if (Object.hasOwn(input, 'participation_rules')) {
    result.participation_rules = nullableText(input.participation_rules, 4000);
  }
  if (Object.hasOwn(input, 'equipment')) {
    result.equipment = equipment(input.equipment);
  }
  if (Object.hasOwn(input, 'admission_mode')) {
    result.admission_mode = admissionMode(input.admission_mode);
  }
  return result;
}

function dayFields(input: Record<string, unknown>): Partial<DayFields> {
  const result: Partial<DayFields> = {};
  if (Object.hasOwn(input, 'local_date')) {
    result.local_date = date(input.local_date);
  }
  if (Object.hasOwn(input, 'description')) {
    result.description = nullableText(input.description, 4000);
  }
  if (Object.hasOwn(input, 'notes')) {
    result.notes = nullableText(input.notes, 4000);
  }
  return result;
}

export function travelUuid(value: unknown): string {
  return uuid(value).toLowerCase();
}

export function createTripInput(value: unknown): Partial<TripFields> & Pick<TripFields, 'title'> {
  const input = tripFields(fields(value, tripKeys));
  if (!input.title) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return { ...input, title: input.title };
}

export function updateTripInput(value: unknown) {
  const input = fields(value, ['trip_revision_id', 'visibility', ...tripKeys]);
  const patch: Partial<TripFields> & { visibility?: 'public' | 'private' } = tripFields(input);
  if (Object.hasOwn(input, 'visibility')) {
    if (input.visibility !== 'public' && input.visibility !== 'private') {
      throw new BffProblem('INVALID_REQUEST');
    }
    patch.visibility = input.visibility;
  }
  if (Object.keys(patch).length === 0) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return { trip_revision_id: travelUuid(input.trip_revision_id), patch };
}

export function dayInput(value: unknown, requirePatch: boolean) {
  const input = fields(value, ['trip_revision_id', ...dayKeys]);
  const patch = dayFields(input);
  if (requirePatch && Object.keys(patch).length === 0) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return { trip_revision_id: travelUuid(input.trip_revision_id), patch };
}

export function routeInput(value: unknown) {
  const input = fields(value, ['trip_revision_id']);
  return { trip_revision_id: travelUuid(input.trip_revision_id) };
}

export function tripListInput(value: unknown) {
  const input = fields(value, ['limit', 'cursor']);
  const { limit = '50', cursor } = input;
  if (typeof limit !== 'string' || !/^(?:[1-9][0-9]?|100)$/.test(limit)) {
    throw new BffProblem('INVALID_REQUEST');
  }
  return { limit: Number(limit), cursor: cursor === undefined ? null : travelUuid(cursor) };
}
