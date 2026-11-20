import type { DynamicModule } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { IdentityDatabase } from './identity-database.js'
import { IDENTITY_SETTINGS, identitySettings } from './identity.config.js'
import type { IdentityOptions } from './identity.config.js'
import { IdentityController } from './identity.controller.js'
import { IdentityService } from './identity.service.js'

@Module({})
export class IdentityModule {
  static configure(options: IdentityOptions): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [IdentityController],
      providers: [
        { provide: IDENTITY_SETTINGS, useValue: identitySettings(options) },
        IdentityDatabase,
        IdentityService,
      ],
    }
  }
}
