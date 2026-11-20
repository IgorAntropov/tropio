import type { DynamicModule } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { TravelDatabase } from './travel-database.js'
import { TravelController } from './travel.controller.js'
import { TRAVEL_DATABASE_URL, travelDatabaseUrl } from './travel.config.js'
import type { TravelOptions } from './travel.config.js'
import { TravelService } from './travel.service.js'

@Module({})
export class TravelModule {
  static configure(options: TravelOptions, identity: DynamicModule): DynamicModule {
    return {
      module: TravelModule,
      imports: [identity],
      controllers: [TravelController],
      providers: [
        { provide: TRAVEL_DATABASE_URL, useValue: travelDatabaseUrl(options) },
        TravelDatabase,
        TravelService,
      ],
    }
  }
}
