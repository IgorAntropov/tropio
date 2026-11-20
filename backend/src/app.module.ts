import type { DynamicModule } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller.js'
import type { IdentityOptions } from './identity/identity.config.js'
import { IdentityModule } from './identity/identity.module.js'
import type { TravelOptions } from './travel/travel.config.js'
import { TravelModule } from './travel/travel.module.js'

@Module({ controllers: [HealthController] })
export class AppModule {
  static configure(identity: IdentityOptions, travel: TravelOptions): DynamicModule {
    const identityModule = IdentityModule.configure(identity)
    return {
      module: AppModule,
      imports: [identityModule, TravelModule.configure(travel, identityModule)],
    }
  }
}
