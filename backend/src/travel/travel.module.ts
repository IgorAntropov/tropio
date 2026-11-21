import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { AccountTrips } from './account-trips.js';
import { EquipmentLibraryController } from './equipment/equipment-library.controller.js';
import { EquipmentLibrary } from './equipment/equipment-library.service.js';
import { ProfileTrips } from './profile-trips.js';
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
      controllers: [TravelController, EquipmentLibraryController],
      providers: [
        { provide: TRAVEL_DATABASE_URL, useValue: travelDatabaseUrl(options) },
        TravelDatabase,
        AccountTrips,
        EquipmentLibrary,
        TravelService,
        PublicationService,
        ProfileTrips,
        PublicCatalog,
        TripApplications,
      ],
      exports: [AccountTrips, ProfileTrips, TravelService, PublicationService, PublicCatalog, TripApplications],
    };
  }
}
