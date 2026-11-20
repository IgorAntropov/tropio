import { randomUUID } from 'node:crypto';
import type {
  ArgumentsHost,
  ExceptionFilter,
} from '@nestjs/common';
import {
  Catch,
  HttpException,
} from '@nestjs/common';
import type { NodeResponse } from '@nestjs/platform-node';

const problems = {
  INVALID_REQUEST: [400, 'Invalid request'],
  SESSION_REQUIRED: [401, 'Session required'],
  INVALID_CREDENTIALS: [401, 'Invalid credentials'],
  CSRF_REJECTED: [403, 'Request origin or CSRF token rejected'],
  NOT_FOUND: [404, 'Not found'],
  IDEMPOTENCY_KEY_REUSED: [409, 'Idempotency key reused'],
  TRIP_REVISION_CONFLICT: [409, 'Trip revision conflict'],
  TRIP_APPLICATION_UNAVAILABLE: [409, 'Participation requests are closed for this user or trip'],
  ROUTE_REVISION_CONFLICT: [409, 'Route revision conflict'],
  POI_REVISION_CONFLICT: [409, 'POI revision conflict'],
  INVALID_PUBLICATION_MANIFEST: [422, 'Invalid publication manifest'],
  ROUTE_NOT_READY: [422, 'Route is not ready'],
  POI_PUBLICATION_RESTRICTED: [422, 'Publication is restricted'],
  PUBLICATION_PRECONDITION_FAILED: [422, 'Publication precondition failed'],
  PUBLICATION_CANCELLED: [409, 'Publication cancelled'],
  INVALID_TRIP_DATES: [422, 'Invalid trip dates'],
  INVALID_ROUTE_TOPOLOGY: [422, 'Invalid route topology'],
  INVALID_SPLIT_POSITION: [422, 'Invalid split position'],
  ROUTE_GEOMETRY_RESTRICTED: [422, 'Route geometry is restricted'],
  ROUTE_BUILD_UNAVAILABLE: [422, 'Route build unavailable'],
  SNAP_CONFIRMATION_REQUIRED: [422, 'Snap confirmation required'],
  POI_SCOPE_RESTRICTED: [422, 'POI scope restricted'],
  INVALID_POI_CATEGORY: [422, 'Invalid POI category'],
  INVALID_AUTH_TOKEN: [422, 'Invalid authentication token'],
  AVATAR_UNAVAILABLE: [422, 'Avatar is unavailable'],
  RATE_LIMITED: [429, 'Too many requests'],
  DEPENDENCY_UNAVAILABLE: [503, 'Dependency unavailable'],
} as const;

export type ProblemCode = keyof typeof problems;

export class BffProblem extends Error {
  constructor(
    readonly code: ProblemCode,
    readonly details?: {
      retryAfter?: number;
      currentTripRevisionId?: string;
      currentRouteRevisionId?: string | null;
      currentPoiRevisionId?: string;
    },
  ) {
    super(code);
  }
}

function normalizeProblem(exception: unknown): BffProblem {
  if (exception instanceof BffProblem) {
    return exception;
  }

  const status = exception instanceof HttpException ? exception.getStatus() : undefined;
  if (status === 404) {
    return new BffProblem('NOT_FOUND');
  }
  if (status && status >= 400 && status < 500) {
    return new BffProblem('INVALID_REQUEST');
  }

  return new BffProblem('DEPENDENCY_UNAVAILABLE');
}

@Catch()
export class BffProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<NodeResponse>();
    if (response.headersSent) {
      return;
    }

    const { code, details } = normalizeProblem(exception);
    const [status, title] = problems[code];
    const requestId = String(response.getHeader('x-request-id') ?? randomUUID());
    response.setHeader('x-request-id', requestId);
    response.setHeader('content-type', 'application/problem+json');
    response.setHeader('cache-control', 'no-store');
    if (details?.retryAfter !== undefined) {
      response.setHeader('retry-after', details.retryAfter);
    }

    response.status(status).json({
      type: `urn:tropio:problem:${code.toLowerCase()}`,
      title,
      status,
      code,
      request_id: requestId,
      ...(code === 'TRIP_REVISION_CONFLICT' && details?.currentTripRevisionId
        ? { current_trip_revision_id: details.currentTripRevisionId }
        : {}),
      ...(code === 'ROUTE_REVISION_CONFLICT' && details?.currentRouteRevisionId
        ? { current_route_revision_id: details.currentRouteRevisionId }
        : {}),
      ...(code === 'POI_REVISION_CONFLICT' && details?.currentPoiRevisionId
        ? { current_poi_revision_id: details.currentPoiRevisionId }
        : {}),
    });
  }
}
