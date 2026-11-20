import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { PublicCatalog } from './public-catalog.js';
import { PublicationService } from './publication.service.js';
import { TravelDatabase } from './travel-database.js';
import { TravelController } from './travel.controller.js';
import {
  TRAVEL_DATABASE_URL,
  travelDatabaseUrl,
} from './travel.config.js';
import type { TravelOptions } from './travel.config.js';
import { TravelService } from './travel.service.js';
import { TripApplications } from './trip-applications.js';

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
        PublicationService,
        PublicCatalog,
        TripApplications,
      ],
      exports: [TravelService, PublicationService, PublicCatalog, TripApplications],
    };
  }
}
