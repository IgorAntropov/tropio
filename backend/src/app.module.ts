import process from 'node:process';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type { GeoOptions } from './geo/geo.config.js';
import { GeoModule } from './geo/geo.module.js';
import { HealthController } from './health/health.controller.js';
import type { IdentityOptions } from './identity/identity.config.js';
import { IdentityModule } from './identity/identity.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { PublicationModule } from './publication/publication.module.js';
import { travelDatabaseUrl } from './travel/travel.config.js';
import type { TravelOptions } from './travel/travel.config.js';
import { TravelModule } from './travel/travel.module.js';

@Module({ controllers: [HealthController] })
export class AppModule {
  static configure(identity: IdentityOptions, travel: TravelOptions, geo: GeoOptions, socialUrl = process.env.TROPIO_SOCIAL_DATABASE_URL): DynamicModule {
    const identityModule = IdentityModule.configure(identity);
    const travelModule = TravelModule.configure(travel, identityModule);
    const geoModule = GeoModule.configure(geo, identityModule, travelModule);
    const workerEnabled = Boolean(travelDatabaseUrl(travel)) && travel.publicationWorker !== false;
    const publication = PublicationModule.configure(identityModule, travelModule, geoModule, workerEnabled);
    return {
      module: AppModule,
      imports: [ProfileModule.configure(identityModule, travelModule, geoModule, publication, socialUrl)],
    };
  }
}
