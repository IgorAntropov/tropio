import { createHash } from 'node:crypto'
import { BffProblem } from '../http/bff-problem.js'
import { date, fields, travelUuid } from '../travel/travel-input.js'

export function publishInput(value: unknown) {
  const input = fields(value, ['trip_revision_id', 'routes', 'poi_ids'])
  if (!Array.isArray(input.routes) || !input.routes.length || input.routes.length > 100
    || !Array.isArray(input.poi_ids) || input.poi_ids.length > 500) throw new BffProblem('INVALID_REQUEST')
  const routes = input.routes.map((item: unknown) => {
    const route = fields(item, ['day_id', 'route_id', 'route_revision_id'])
    return {
      day_id: travelUuid(route.day_id), route_id: travelUuid(route.route_id),
      route_revision_id: travelUuid(route.route_revision_id),
    }
  })
  const poi_ids = input.poi_ids.map(travelUuid).sort()
  if (new Set(poi_ids).size !== poi_ids.length) throw new BffProblem('INVALID_REQUEST')
  return { trip_revision_id: travelUuid(input.trip_revision_id), routes, poi_ids }
}

export function unpublishInput(value: unknown) {
  const input = fields(value, ['trip_revision_id', 'publication_id'])
  return {
    trip_revision_id: travelUuid(input.trip_revision_id),
    publication_id: input.publication_id === null ? null : travelUuid(input.publication_id),
  }
}

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function catalogText(value: unknown, max: number) {
  if (value === undefined) return null
  if (typeof value !== 'string' || [...value].length > max
    || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) throw new BffProblem('INVALID_REQUEST')
  return value.trim() || null
}

function bounds(value: unknown) {
  if (value === undefined) return null
  if (typeof value !== 'string') throw new BffProblem('INVALID_REQUEST')
  const parts = value.split(',')
  if (parts.length !== 4 || parts.some(part => !/^-?\d+(?:\.\d+)?$/.test(part))) throw new BffProblem('INVALID_REQUEST')
  const [west, south, east, north] = parts.map(Number) as [number, number, number, number]
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new BffProblem('INVALID_REQUEST')
  }
  return [west, south, east, north]
}

export interface CatalogPosition {
  id: string
  distance: number
}

export function applicationTripIds(value: unknown): string[] {
  const { trip_ids } = fields(value, ['trip_ids'])
  if (typeof trip_ids !== 'string' || trip_ids.length > 3699) throw new BffProblem('INVALID_REQUEST')
  const ids = trip_ids.split(',').map(travelUuid)
  if (new Set(ids).size !== ids.length) throw new BffProblem('INVALID_REQUEST')
  return ids
}

function nearLocation(near: unknown, radius: unknown) {
  if (near === undefined && radius === undefined) return { near: null, radius: null }
  if (typeof near !== 'string' || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(near)) throw new BffProblem('INVALID_REQUEST')
  const point = near.split(',').map(Number) as [number, number]
  if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new BffProblem('INVALID_REQUEST')
  if (radius === undefined) return { near: point, radius: null }
  if (typeof radius !== 'string' || !/^\d+(?:\.\d+)?$/.test(radius)
    || Number(radius) <= 0 || Number(radius) > 20100) throw new BffProblem('INVALID_REQUEST')
  return { near: point, radius: Number(radius) }
}

export function catalogInput(value: unknown) {
  const input = fields(value, ['q', 'start_date', 'end_date', 'difficulty', 'trip_type', 'region', 'bbox', 'cursor', 'limit', 'near', 'radius_km'])
  const { limit = '30', cursor, trip_type, region } = input
  if (region !== undefined && (typeof region !== 'string' || !/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(region))) {
    throw new BffProblem('INVALID_REQUEST')
  }
  if (typeof limit !== 'string' || !/^(?:[1-9][0-9]?|100)$/.test(limit)) throw new BffProblem('INVALID_REQUEST')
  if (trip_type !== undefined && (typeof trip_type !== 'string' || trip_type.length > 80)) throw new BffProblem('INVALID_REQUEST')
  const types = trip_type ? trip_type.split(',').sort() : []
  if (new Set(types).size !== types.length || types.some(type => !['foot', 'car', 'bicycle', 'combined'].includes(type))) {
    throw new BffProblem('INVALID_REQUEST')
  }
  const start = input.start_date === undefined ? null : date(input.start_date)
  const end = input.end_date === undefined ? null : date(input.end_date)
  if (start && end && start > end) throw new BffProblem('INVALID_REQUEST')
  const location = nearLocation(input.near, input.radius_km)
  const filters = { ...location, q: catalogText(input.q, 120), difficulty: catalogText(input.difficulty, 80), types, start, end, bbox: bounds(input.bbox), region }
  const prefix = fingerprint(['public-trips', filters])
  const encode = ({ id, distance }: CatalogPosition) => Buffer.from([prefix, id, distance].join(':')).toString('base64url')
  let after: CatalogPosition | null = null
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || !/^[\w-]{1,1024}$/.test(cursor)) throw new BffProblem('INVALID_REQUEST')
    const decoded = Buffer.from(cursor, 'base64url').toString()
    const [, id, metres] = decoded.split(':')
    if (!metres || !/^\d{1,8}$/.test(metres)) throw new BffProblem('INVALID_REQUEST')
    after = { id: travelUuid(id), distance: Number(metres) }
    if (encode(after) !== cursor) throw new BffProblem('INVALID_REQUEST')
  }
  return { filters, after, limit: Number(limit), encode }
}
