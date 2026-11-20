import { BffProblem } from '../http/bff-problem.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new BffProblem('INVALID_REQUEST')
  return value
}

function fields(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BffProblem('INVALID_REQUEST')
  const keys = Object.keys(value)
  if (keys.length === 0 || keys.some((key) => !allowed.includes(key))) throw new BffProblem('INVALID_REQUEST')
  return value as Record<string, unknown>
}

function string(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== 'string' || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) {
    throw new BffProblem('INVALID_REQUEST')
  }
  const length = Array.from(value).length
  if (length < minimum || length > maximum) throw new BffProblem('INVALID_REQUEST')
  return value
}

function email(value: unknown): string {
  const address = string(value, 1, 254).trim().toLowerCase()
  const [local = '', domain = '', ...extra] = address.split('@')
  const labels = domain.split('.')
  if (extra.length > 0 || local.length === 0 || local.length > 64
    || !/^[a-z0-9!#$%&'*+/=?^`{|}~_.-]+$/.test(local)
    || /(^\.|\.$|\.\.)/.test(local)
    || labels.length < 2
    || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new BffProblem('INVALID_REQUEST')
  }
  return address
}

export function emailInput(value: unknown): string {
  return email(fields(value, ['email']).email)
}

export function registerInput(value: unknown) {
  const input = fields(value, ['email', 'password', 'accepted_terms'])
  if (input.accepted_terms !== true) throw new BffProblem('INVALID_REQUEST')
  return { email: email(input.email), password: string(input.password, 12, 128) }
}

export function loginInput(value: unknown) {
  const input = fields(value, ['email', 'password'])
  return { email: email(input.email), password: string(input.password, 1, 128) }
}

export function tokenInput(value: unknown): string {
  return string(fields(value, ['token']).token, 1, 256)
}

export function resetInput(value: unknown) {
  const input = fields(value, ['token', 'password'])
  return { token: string(input.token, 1, 256), password: string(input.password, 12, 128) }
}

export interface ProfilePatch {
  displayName?: string
  bio?: string | null
}

export function profileInput(value: unknown): ProfilePatch {
  const input = fields(value, ['display_name', 'bio'])
  const patch: ProfilePatch = {}
  if (Object.hasOwn(input, 'display_name')) {
    patch.displayName = string(string(input.display_name, 1, 80).trim(), 1, 80)
  }
  if (Object.hasOwn(input, 'bio')) {
    patch.bio = input.bio === null ? null : string(input.bio, 0, 1000).trim() || null
  }
  return patch
}

export function avatarInput(value: unknown): string {
  return uuid(fields(value, ['avatar_id']).avatar_id)
}
