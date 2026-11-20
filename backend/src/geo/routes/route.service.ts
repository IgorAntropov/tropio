import { createHash, randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { BffProblem } from '../../http/bff-problem.js'
import { GeoAccess } from '../geo-access.js'
import { GeoDatabase } from '../geo-database.js'
import { PoiAccess } from '../pois/poi-access.js'
import { GeoProviders } from '../providers/index.js'
import type { TransportMode } from '../providers/index.js'
import { buildRouteTracks, cutTrack, finalizeDistances, samePosition, splitSnapshot, updatePointText } from './route-geometry.js'
import { routeEdit, routeRestore, routeSplit, routeUuid } from './route-input.js'
import type { PointInput } from './route-input.js'
import { readHead, readReceipt, readSnapshot, revisionById, saveSnapshot, tripModes } from './route-store.js'
import type { Dependency, Receipt, Revision, RoutePoint, RouteTrack, Snapshot } from './route-store.js'

type Kind = 'replace' | 'split' | 'restore'

interface Command {
  routeId: string
  tripId: string
  actorId: string
  key: string
  fingerprint: string
  kind: Kind
  base: string | null
  tripRouteIds: string[]
}

interface OperationResult {
  revision: Revision
  details?: Record<string, unknown>
}

interface Plan {
  snapshot: Snapshot
  details?: Record<string, unknown>
}

type Prepare = (client: PoolClient, current: Revision | null) => Promise<() => Promise<Plan>>

function fingerprint(data: object): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex')
}

function latestRevision(current: Revision | null, expected: string | null): void {
  if ((current?.revision_id ?? null) !== expected) {
    throw new BffProblem('ROUTE_REVISION_CONFLICT', { currentRouteRevisionId: current?.revision_id })
  }
}

function uniqueDependencies(dependencies: Dependency[]): Dependency[] {
  return [...new Map(dependencies.map(dependency =>
    [`${dependency.poi_id}:${dependency.position_revision_id}`, dependency])).values()]
    .sort((left, right) => left.poi_id.localeCompare(right.poi_id)
      || left.position_revision_id.localeCompare(right.position_revision_id))
}

function pointPayload(point: RoutePoint) {
  return {
    point_id: point.point_id, position: point.position,
    ...(point.requested_position ? { requested_position: point.requested_position } : {}),
    ...(point.snapped_position ? { snapped_position: point.snapped_position } : {}),
    ...(point.poi_id ? { poi_id: point.poi_id } : {}),
    ...(point.name ? { name: point.name } : {}),
    ...(point.description ? { description: point.description } : {}),
  }
}

function trackPayload(track: RouteTrack) {
  return {
    track_id: track.track_id, start_point_id: track.start_point_id, end_point_id: track.end_point_id,
    build_mode: track.build_mode, transport_mode: track.transport_mode, status: track.status,
    geometry: track.geometry, distance_m: track.distance_m,
    ascent_m: track.ascent_m, descent_m: track.descent_m,
    min_elevation_m: track.min_elevation_m, max_elevation_m: track.max_elevation_m,
    ...(track.name ? { name: track.name } : {}),
    ...(track.description ? { description: track.description } : {}),
    ...(track.estimated_duration_s == null ? {} : { estimated_duration_s: track.estimated_duration_s }),
    ...(track.routing_provider ? { routing_provider: track.routing_provider } : {}),
    ...(track.route_source_version ? { route_source_version: track.route_source_version } : {}),
    ...(track.elevation_profile ? { elevation_profile: track.elevation_profile } : {}),
  }
}

@Injectable()
export class RouteService {
  constructor(
    @Inject(GeoDatabase) private readonly database: GeoDatabase,
    @Inject(GeoAccess) private readonly access: GeoAccess,
    @Inject(PoiAccess) private readonly poi: PoiAccess,
    @Inject(GeoProviders) private readonly providers: GeoProviders,
  ) {}

  private async isReadable(client: PoolClient, actorId: string, tripId: string, dependencies: Dependency[]) {
    for (const dependency of uniqueDependencies(dependencies)) {
      if (!await this.poi.canReadDependency(
        client, actorId, tripId, dependency.poi_id, dependency.position_revision_id,
      )) return false
    }
    return true
  }

  private async assertReadable(client: PoolClient, actorId: string, tripId: string, dependencies: Dependency[]) {
    if (!await this.isReadable(client, actorId, tripId, dependencies)) throw new BffProblem('ROUTE_GEOMETRY_RESTRICTED')
  }

  private async typeOfTrip(
    client: PoolClient, actorId: string, tripId: string, routeId: string, routeIds: string[], snapshot: Snapshot,
  ) {
    const siblings = await tripModes(client, routeIds.filter(id => id !== routeId))
    if (!await this.isReadable(client, actorId, tripId, siblings.flatMap(route => route.dependencies))) return null

    const transports = new Set<TransportMode>([
      ...snapshot.tracks.map(track => track.transport_mode),
      ...siblings.flatMap(route => route.modes),
    ])
    return transports.size > 1 ? 'combined' as const : transports.values().next().value ?? null
  }

  private async response(
    client: PoolClient, actorId: string, tripId: string, routeId: string, routeIds: string[], current: Revision | null,
  ) {
    const snapshot = await readSnapshot(client, routeId, current?.version ?? null)
    if (current && !await this.isReadable(client, actorId, tripId, snapshot.dependencies)) {
      return { availability: 'geometry_restricted' as const, route_id: routeId, route_revision_id: current.revision_id }
    }

    return {
      availability: 'available' as const, route_id: routeId, route_revision_id: current?.revision_id ?? null,
      points: snapshot.points.map(pointPayload), tracks: snapshot.tracks.map(trackPayload),
      trip_type: await this.typeOfTrip(client, actorId, tripId, routeId, routeIds, snapshot),
    }
  }

  async read(actorId: string, routeId: string) {
    const tripId = await this.access.routeTrip(actorId, routeId)
    const routeIds = await this.access.tripRouteIds(actorId, tripId)
    return this.database.transaction(async (client) =>
      this.response(client, actorId, tripId, routeId, routeIds, await readHead(client, routeId)))
  }

  private async readOperation(client: PoolClient, command: Command, receipt: Receipt): Promise<OperationResult> {
    const { rows: [revision] } = await client.query<Revision>(
      'SELECT revision_id, version FROM geo.route_geometry_versions WHERE route_id = $1 AND version = $2 AND sealed',
      [command.routeId, receipt.result_version],
    )
    if (!revision) throw new BffProblem('DEPENDENCY_UNAVAILABLE')

    const { dependencies } = await readSnapshot(client, command.routeId, revision.version)
    await this.assertReadable(client, command.actorId, command.tripId, dependencies)
    if (receipt.kind !== command.kind || receipt.request_hash !== command.fingerprint) {
      throw new BffProblem('IDEMPOTENCY_KEY_REUSED')
    }
    return { revision, details: receipt.operation_details }
  }

  private async execute(command: Command, prepare: Prepare): Promise<OperationResult> {
    const initial = await this.database.transaction(async (client) => {
      const receipt = await readReceipt(client, command.routeId, command.actorId, command.key)
      if (receipt) return { result: await this.readOperation(client, command, receipt) }

      const head = await readHead(client, command.routeId)
      if ((head?.revision_id ?? null) !== command.base) {
        const settled = await readReceipt(client, command.routeId, command.actorId, command.key)
        if (settled) return { result: await this.readOperation(client, command, settled) }
      }
      latestRevision(head, command.base)
      return { calculate: await prepare(client, head) }
    })
    if ('result' in initial && initial.result) return initial.result
    const plan = await initial.calculate()

    return this.database.transaction(async (client) => {
      const now = await readHead(client, command.routeId, true)
      if (await this.access.routeTrip(command.actorId, command.routeId) !== command.tripId) {
        throw new BffProblem('NOT_FOUND')
      }
      const receipt = await readReceipt(client, command.routeId, command.actorId, command.key)
      if (receipt) return this.readOperation(client, command, receipt)
      latestRevision(now, command.base)
      await this.assertReadable(client, command.actorId, command.tripId, plan.snapshot.dependencies)
      await finalizeDistances(client, plan.snapshot.tracks)
      const revision = await saveSnapshot(client, command.routeId, now?.version ?? null, plan.snapshot, commandOperation(command, plan))
      return { revision, details: plan.details }
    })
  }

  private async initialize(
    actorId: string, routeId: string, key: string, kind: Kind, input: { route_revision_id: string | null; [field: string]: unknown },
  ): Promise<Command> {
    const tripId = await this.access.routeTrip(actorId, routeId)
    return {
      actorId, routeId, tripId, kind, key: routeUuid(key), base: input.route_revision_id,
      fingerprint: fingerprint(input), tripRouteIds: await this.access.tripRouteIds(actorId, tripId),
    }
  }

  private async preparedPoints(client: PoolClient, command: Command, input: PointInput[], previous: Snapshot) {
    const points = input.map(edit => {
      const old = edit.point_id ? previous.points.find(point => point.point_id === edit.point_id) : undefined
      if (edit.point_id && !old) throw new BffProblem('INVALID_ROUTE_TOPOLOGY')
      const prior = old?.requested_position ?? old?.position
      const unchanged = !!old && (samePosition(old.position, edit.position) || !!prior && samePosition(prior, edit.position))
      const point: RoutePoint = {
        ...old,
        point_id: old?.point_id ?? randomUUID(),
        position: unchanged && prior ? prior : edit.position,
        requested_position: undefined,
        snapped_position: undefined,
        poi_id: edit.poi_id ?? (unchanged ? old?.poi_id : undefined),
      }
      updatePointText(point, edit)
      return point
    })
    const linked = [...new Set(points.flatMap(point => point.poi_id ? [point.poi_id] : []))].sort()
    const resolved = new Map<string, Awaited<ReturnType<PoiAccess['resolvePoint']>>>()
    for (const poiId of linked) resolved.set(poiId, await this.poi.resolvePoint(client, command.actorId, command.tripId, poiId))

    const dependencies: Dependency[] = []
    for (const point of points) {
      if (!point.poi_id) continue
      const place = resolved.get(point.poi_id)
      if (!place) throw new BffProblem('NOT_FOUND')
      point.position = place.position
      dependencies.push({ poi_id: point.poi_id, position_revision_id: place.positionRevisionId })
    }
    return { points, dependencies }
  }

  async replace(actorId: string, routeId: string, key: string, body: unknown) {
    const edit = routeEdit(body)
    const command = await this.initialize(actorId, routeId, key, 'replace', edit)
    const result = await this.execute(command, async (client, head) => {
      const previous = await readSnapshot(client, routeId, head?.version ?? null)
      const keepsEntities = edit.points.some(point => !!point.point_id) || edit.tracks.some(track => !!track.track_id)
      if (keepsEntities) await this.assertReadable(client, actorId, command.tripId, previous.dependencies)
      const { points, dependencies } = await this.preparedPoints(client, command, edit.points, previous)
      return async () => {
        const { tracks, surfaces } = await buildRouteTracks(this.providers, points, edit.tracks, previous)
        return {
          snapshot: {
            points, tracks, surfaces,
            dependencies: uniqueDependencies(keepsEntities ? [...previous.dependencies, ...dependencies] : dependencies),
          },
        }
      }
    })
    return this.renderOperation(command, result)
  }

  async split(actorId: string, trackId: string, key: string, body: unknown) {
    const input = routeSplit(body)
    const command = await this.initialize(actorId, input.route_id, key, 'split', { ...input, track_id: trackId })
    const result = await this.execute(command, async (client, head) => {
      if (!head) throw new BffProblem('NOT_FOUND')
      const snapshot = await readSnapshot(client, command.routeId, head.version)
      await this.assertReadable(client, actorId, command.tripId, snapshot.dependencies)
      if (!snapshot.tracks.some(track => track.track_id === trackId)) throw new BffProblem('NOT_FOUND')
      const cut = await cutTrack(client, command.routeId, head.version, trackId, input.split_position)
      return async () => ({ snapshot, details: await splitSnapshot(this.providers, snapshot, trackId, cut) })
    })
    return { route_id: command.routeId, route_revision_id: result.revision.revision_id, ...result.details }
  }

  async restore(actorId: string, routeId: string, key: string, body: unknown) {
    const input = routeRestore(body)
    const command = await this.initialize(actorId, routeId, key, 'restore', input)
    const result = await this.execute(command, async (client) => {
      const revision = await revisionById(client, routeId, input.target_revision_id)
      if (!revision) throw new BffProblem('NOT_FOUND')
      const snapshot = await readSnapshot(client, routeId, revision.version)
      await this.assertReadable(client, actorId, command.tripId, snapshot.dependencies)
      return async () => ({ snapshot })
    })
    return this.renderOperation(command, result)
  }

  private async renderOperation(command: Command, result: OperationResult) {
    return this.database.transaction(async (client) => {
      const response = await this.response(
        client, command.actorId, command.tripId, command.routeId, command.tripRouteIds, result.revision,
      )
      if (response.availability === 'geometry_restricted') throw new BffProblem('ROUTE_GEOMETRY_RESTRICTED')
      return response
    })
  }
}

function commandOperation(command: Command, plan: Plan) {
  return {
    kind: command.kind, key: command.key, actorId: command.actorId,
    fingerprint: command.fingerprint, details: plan.details,
  }
}
