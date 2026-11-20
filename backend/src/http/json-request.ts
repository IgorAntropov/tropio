import type { NodeRequest } from '@nestjs/platform-node'
import { BffProblem } from './bff-problem.js'

export function requireJson(request: NodeRequest): void {
  if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new BffProblem('INVALID_REQUEST')
  }
}
