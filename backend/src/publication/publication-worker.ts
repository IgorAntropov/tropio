import {
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { GeoPublicationService } from '../geo/publication/geo-publication.service.js';
import { BffProblem } from '../http/bff-problem.js';
import { PublicationService } from '../travel/publication.service.js';
import type { Job } from '../travel/publication.service.js';

export const PUBLICATION_WORKER_ENABLED = Symbol('publication worker enabled');

const failures = new Set([
  'ROUTE_REVISION_CONFLICT', 'ROUTE_NOT_READY', 'POI_PUBLICATION_RESTRICTED',
  'PUBLICATION_PRECONDITION_FAILED', 'PUBLICATION_CANCELLED',
]);

@Injectable()
export class PublicationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;
  private readonly logger = new Logger(PublicationWorker.name);

  constructor(
    @Inject(PublicationService) private readonly travel: PublicationService,
    @Inject(GeoPublicationService) private readonly geo: GeoPublicationService,
    @Inject(PUBLICATION_WORKER_ENABLED) private readonly enabled: boolean,
  ) {}

  onApplicationBootstrap() {
    if (this.enabled) {
      this.schedule(0);
    }
  }

  private schedule(delay: number) {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .then(worked => this.schedule(worked ? 0 : 250))
        .catch(() => {
          this.logger.warn('Publication storage unavailable, retrying');
          this.schedule(2000);
        });
    }, delay);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  private async prepare(job: Job) {
    try {
      const manifest = await this.travel.manifest(job);
      if (!manifest) {
        return;
      }
      await this.geo.prepare(manifest);
      if (!await this.travel.manifest(job)) {
        return;
      }
      const verified = await this.geo.verify(manifest);
      await this.travel.commit(job, verified);
    }
    catch (error) {
      if (error instanceof BffProblem && failures.has(error.code)) {
        await this.travel.fail(job, error.code);
      }
      else {
        this.logger.warn(`Publication ${job.id} awaits retry`);
      }
    }
  }

  private async release(job: Job) {
    try {
      await this.geo.release(job.id, job.trip_id);
      await this.travel.acknowledgeRelease(job);
    }
    catch {
      this.logger.warn(`Publication hold ${job.id} awaits release`);
    }
  }

  async runOnce() {
    const prepare = await this.travel.claim('prepare');
    if (prepare) {
      await this.prepare(prepare);
    }
    const release = await this.travel.claim('release');
    if (release) {
      await this.release(release);
    }
    return Boolean(prepare || release);
  }
}
