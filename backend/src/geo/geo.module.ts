import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { GeoAccess } from './geo-access.js';
import { GeoDatabase } from './geo-database.js';
import { GEO_OPTIONS } from './geo.config.js';
import type { GeoOptions } from './geo.config.js';
import { GeoController } from './geo.controller.js';
import { PoiAccess } from './pois/poi-access.js';
import { PoiService } from './pois/poi.service.js';
import { GeoPublicationService } from './publication/geo-publication.service.js';
import { GeoProviders } from './providers/index.js';
import { RouteService } from './routes/route.service.js';

@Module({})
export class GeoModule {
  static configure(options: GeoOptions, identity: DynamicModule, travel: DynamicModule): DynamicModule {
    return {
      module: GeoModule,
      imports: [identity, travel],
      controllers: [GeoController],
      providers: [
        { provide: GEO_OPTIONS, useValue: options },
        { provide: GeoProviders, useFactory: () => new GeoProviders(options.providers) },
        GeoDatabase,
        GeoPublicationService,
        GeoAccess,
        RouteService,
        PoiAccess,
        PoiService,
      ],
      exports: [GeoPublicationService],
    };
  }
}
