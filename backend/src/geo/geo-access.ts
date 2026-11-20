import { Inject, Injectable } from '@nestjs/common'
import type { NodeRequest } from '@nestjs/platform-node'
import { BffProblem } from '../http/bff-problem.js'
import { requireJson } from '../http/json-request.js'
import { uuid } from '../identity/identity-input.js'
import { mutationSession, readToken, requireSession, sessionCookie } from '../identity/identity-session.js'
import { IDENTITY_SETTINGS } from '../identity/identity.config.js'
import type { IdentitySettings } from '../identity/identity.config.js'
import { IdentityService } from '../identity/identity.service.js'
import { TravelService } from '../travel/travel.service.js'

@Injectable()
export class GeoAccess {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IDENTITY_SETTINGS) private readonly identitySettings: IdentitySettings,
    @Inject(TravelService) private readonly travel: TravelService,
  ) {}

  viewer(request: NodeRequest): Promise<string> {
    return this.identity.authenticate(requireSession(request))
  }

  optionalViewer(request: NodeRequest): Promise<string | null> {
    return this.identity.optionalViewer(readToken(request, sessionCookie))
  }

  async mutation(request: NodeRequest, body = true) {
    const actorId = await this.confirmMutation(request, body)
    return { actorId, key: uuid(request.headers['idempotency-key']).toLowerCase() }
  }

  async confirmMutation(request: NodeRequest, body: boolean): Promise<string> {
    const token = mutationSession(request, this.identitySettings.browserOrigin)
    const actorId = await this.identity.authenticate(token)
    if (body) requireJson(request)
    return actorId
  }

  canEditTrip(actorId: string, tripId: string): Promise<boolean> {
    return this.travel.canEditTrip(actorId, tripId)
  }

  async requireTrip(actorId: string, tripId: string): Promise<void> {
    if (!await this.canEditTrip(actorId, tripId)) throw new BffProblem('NOT_FOUND')
  }

  routeTrip(actorId: string, routeId: string): Promise<string> {
    return this.travel.routeTrip(actorId, routeId)
  }

  tripRouteIds(actorId: string, tripId: string): Promise<string[]> {
    return this.travel.tripRouteIds(actorId, tripId)
  }

  canModerate(actorId: string): Promise<boolean> {
    return this.identity.canModeratePois(actorId)
  }
}
