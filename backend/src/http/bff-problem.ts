import { randomUUID } from 'node:crypto'
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import { Catch, HttpException } from '@nestjs/common'
import type { NodeResponse } from '@nestjs/platform-node'

const problems = {
  INVALID_REQUEST: [400, 'Invalid request'],
  SESSION_REQUIRED: [401, 'Session required'],
  INVALID_CREDENTIALS: [401, 'Invalid credentials'],
  CSRF_REJECTED: [403, 'Request origin or CSRF token rejected'],
  NOT_FOUND: [404, 'Not found'],
  INVALID_AUTH_TOKEN: [422, 'Invalid authentication token'],
  AVATAR_UNAVAILABLE: [422, 'Avatar is unavailable'],
  RATE_LIMITED: [429, 'Too many requests'],
  DEPENDENCY_UNAVAILABLE: [503, 'Dependency unavailable'],
} as const

export type ProblemCode = keyof typeof problems

export class BffProblem extends Error {
  constructor(
    readonly code: ProblemCode,
    readonly retryAfter?: number,
  ) {
    super(code)
  }
}

function normalizeProblem(exception: unknown): BffProblem {
  if (exception instanceof BffProblem) return exception

  const status = exception instanceof HttpException ? exception.getStatus() : undefined
  if (status === 404) return new BffProblem('NOT_FOUND')
  if (status && status >= 400 && status < 500) return new BffProblem('INVALID_REQUEST')

  return new BffProblem('DEPENDENCY_UNAVAILABLE')
}

@Catch()
export class BffProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<NodeResponse>()
    if (response.headersSent) return

    const { code, retryAfter } = normalizeProblem(exception)
    const [status, title] = problems[code]
    const requestId = String(response.getHeader('x-request-id') ?? randomUUID())
    response.setHeader('x-request-id', requestId)
    response.setHeader('content-type', 'application/problem+json')
    response.setHeader('cache-control', 'no-store')
    if (retryAfter !== undefined) response.setHeader('retry-after', retryAfter)

    response.status(status).json({
      type: `urn:tropio:problem:${code.toLowerCase()}`,
      title,
      status,
      code,
      request_id: requestId,
    })
  }
}
