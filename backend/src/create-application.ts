import type { NestApplicationOptions } from '@nestjs/common'
import { VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestNodeApplication } from '@nestjs/platform-node'
import { NodeAdapter } from '@nestjs/platform-node'
import { AppModule } from './app.module.js'

export async function createApplication(options: NestApplicationOptions = {}) {
  const app = await NestFactory.create<NestNodeApplication>(
    AppModule,
    new NodeAdapter(),
    options,
  )

  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  return app
}
