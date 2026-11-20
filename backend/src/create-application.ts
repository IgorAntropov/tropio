import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { NestApplicationOptions } from '@nestjs/common'
import { VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestNodeApplication } from '@nestjs/platform-node'
import { NodeAdapter } from '@nestjs/platform-node'
import { AppModule } from './app.module.js'
import type { GeoOptions } from './geo/geo.config.js'
import { BffProblemFilter } from './http/bff-problem.js'
import type { IdentityOptions } from './identity/identity.config.js'
import type { TravelOptions } from './travel/travel.config.js'

function jsonBodyKind(request: IncomingMessage): 'large' | 'default' | undefined {
  const path = request.url?.split('?')[0]?.replace(/\/$/, '') ?? ''
  const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return undefined

  const method = request.method
  if ((method === 'POST' && (path === '/api/v1/trips' || /^\/api\/v1\/trips\/[^/]+\/days$/.test(path)))
    || (method === 'PATCH' && /^\/api\/v1\/(trips|days)\/[^/]+$/.test(path))
    || (method === 'PUT' && /^\/api\/v1\/(days\/[^/]+\/route|routes\/[^/]+)$/.test(path))) return 'large'

  if (method === 'PATCH' || method === 'PUT' || (method === 'DELETE' && /^\/api\/v1\/pois\/[^/]+$/.test(path))
    || (method === 'POST' && path !== '/api/v1/auth/refresh' && path !== '/api/v1/auth/logout')) return 'default'
}

export async function createApplication(
  options: NestApplicationOptions = {},
  identity: IdentityOptions = {},
  travel: TravelOptions = {},
  geo: GeoOptions = {},
) {
  const adapter = new NodeAdapter()
  adapter.setOnRequestHook((request, response, done) => {
    response.setHeader('x-request-id', randomUUID())
    if (request.url?.startsWith('/api/')) response.setHeader('cache-control', 'no-store')
    done()
  })

  const app = await NestFactory.create<NestNodeApplication>(
    AppModule.configure(identity, travel, geo),
    adapter,
    { ...options, bodyParser: false },
  )

  app.useBodyParser('json', {
    limit: '256kb',
    inflate: false,
    type: (request) => jsonBodyKind(request) === 'large',
  })
  app.useBodyParser('json', {
    limit: '8kb',
    inflate: false,
    type: (request) => jsonBodyKind(request) === 'default',
  })
  app.useGlobalFilters(new BffProblemFilter())
  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  return app
}
