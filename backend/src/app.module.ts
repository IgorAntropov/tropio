import type { DynamicModule } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller.js'
import type { IdentityOptions } from './identity/identity.config.js'
import { IdentityModule } from './identity/identity.module.js'

@Module({ controllers: [HealthController] })
export class AppModule {
  static configure(identity: IdentityOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [IdentityModule.configure(identity)],
    }
  }
}
