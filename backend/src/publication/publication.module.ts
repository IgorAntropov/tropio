import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import {
  PUBLICATION_WORKER_ENABLED,
  PublicationWorker,
} from './publication-worker.js';
import { PublicationController } from './publication.controller.js';

@Module({})
export class PublicationModule {
  static configure(identity: DynamicModule, travel: DynamicModule, geo: DynamicModule, workerEnabled: boolean): DynamicModule {
    return {
      module: PublicationModule,
      imports: [identity, travel, geo],
      exports: [CatalogService],
      controllers: [PublicationController],
      providers: [CatalogService, PublicationWorker, { provide: PUBLICATION_WORKER_ENABLED, useValue: workerEnabled }],
    };
  }
}
