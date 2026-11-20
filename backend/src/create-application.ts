import { randomUUID } from 'node:crypto'
import type { NestApplicationOptions } from '@nestjs/common'
import { VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestNodeApplication } from '@nestjs/platform-node'
import { NodeAdapter } from '@nestjs/platform-node'
import { AppModule } from './app.module.js'
import { BffProblemFilter } from './http/bff-problem.js'
import type { IdentityOptions } from './identity/identity.config.js'

export async function createApplication(options: NestApplicationOptions = {}, identity: IdentityOptions = {}) {
  const adapter = new NodeAdapter()
  adapter.setOnRequestHook((request, response, done) => {
    response.setHeader('x-request-id', randomUUID())
    if (request.url?.startsWith('/api/')) response.setHeader('cache-control', 'no-store')
    done()
  })

  const app = await NestFactory.create<NestNodeApplication>(
    AppModule.configure(identity),
    adapter,
    { ...options, bodyParser: false },
  )

  app.useBodyParser('json', {
    limit: '8kb',
    inflate: false,
    type: (request) => {
      const path = request.url?.split('?')[0]?.replace(/\/$/, '')
      const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase()
      return contentType === 'application/json' && (request.method === 'PATCH' || request.method === 'PUT'
        || (request.method === 'POST' && path !== '/api/v1/auth/refresh' && path !== '/api/v1/auth/logout'))
    },
  })
  app.useGlobalFilters(new BffProblemFilter())
  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  return app
}
