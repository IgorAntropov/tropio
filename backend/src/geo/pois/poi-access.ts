import { Inject, Injectable } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { BffProblem } from '../../http/bff-problem.js'
import { GeoAccess } from '../geo-access.js'
import { getPoiRow } from './poi-data.js'
import type { PoiRow } from './poi-data.js'

type TripPermission = (actorId: string, tripId: string) => Promise<boolean>

export function canReadPoi(row: PoiRow, actorId: string | null, checkTrip: TripPermission): Promise<boolean> {
  if (row.deleted) return Promise.resolve(false)
  if (row.visibility === 'global' && row.moderation_status === 'approved'
    && row.position_revision_id === row.approved_position_revision_id) return Promise.resolve(true)
  if (!actorId) return Promise.resolve(false)
  if (row.visibility === 'trip') {
    return row.scope_trip_id ? checkTrip(actorId, row.scope_trip_id) : Promise.resolve(false)
  }
  return Promise.resolve(row.author_user_id === actorId)
}

export function fitsTripScope(row: PoiRow, tripId: string): boolean {
  return row.visibility !== 'trip' || row.scope_trip_id === tripId
}

@Injectable()
export class PoiAccess {
  constructor(@Inject(GeoAccess) private readonly access: GeoAccess) {}

  canRead(row: PoiRow, actorId: string | null) {
    return canReadPoi(row, actorId, (id, tripId) => this.access.canEditTrip(id, tripId))
  }

  async resolvePoint(client: PoolClient, actorId: string, tripId: string, poiId: string) {
    const row = await getPoiRow(client, poiId, 'share')
    if (!row || !await this.canRead(row, actorId)) throw new BffProblem('NOT_FOUND')
    if (!fitsTripScope(row, tripId)) throw new BffProblem('POI_SCOPE_RESTRICTED')
    return { position: row.position, positionRevisionId: row.position_revision_id }
  }

  async canReadDependency(client: PoolClient, actorId: string, tripId: string, poiId: string, revisionId: string) {
    const row = await getPoiRow(client, poiId, 'share')
    return !!row && row.position_revision_id === revisionId
      && fitsTripScope(row, tripId) && await this.canRead(row, actorId)
  }
}
