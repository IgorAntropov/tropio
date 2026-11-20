import type { NodeRequest } from '@nestjs/platform-node'
import { BffProblem } from '../http/bff-problem.js'
import { requireJson } from '../http/json-request.js'
import { mutationSession } from '../identity/identity-session.js'
import type { IdentityService } from '../identity/identity.service.js'
import { travelUuid } from './travel-input.js'

export async function travelActor(request: NodeRequest, identity: IdentityService, browserOrigin: string) {
  const token = mutationSession(request, browserOrigin)
  const userId = await identity.authenticate(token)
  return {
    userId,
    confirmSession: async () => {
      if (await identity.authenticate(token) !== userId) throw new BffProblem('SESSION_REQUIRED')
    },
  }
}

export async function travelCommandContext(request: NodeRequest, identity: IdentityService, browserOrigin: string) {
  const editor = await travelActor(request, identity, browserOrigin)
  requireJson(request)
  return { key: travelUuid(request.headers['idempotency-key']), editor }
}
