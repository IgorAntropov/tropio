import {
  Inject,
  Injectable,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BffProblem } from '../../http/bff-problem.js';
import { GeoDatabase } from '../geo-database.js';
import {
  countMappedTrips,
  heldSummaries,
  lockBatch,
  manifestHash,
  ownedRouteSummaries,
  publicDays,
  retainRoutes,
  selectedPois,
  tripType,
} from './publication-store.js';
import type {
  GeoManifest,
  OwnedRouteSet,
  OwnedRouteSummary,
} from './publication-store.js';

export type { GeoManifest } from './publication-store.js';

@Injectable()
export class GeoPublicationService {
  constructor(@Inject(GeoDatabase) private readonly database: GeoDatabase) {}

  countMappedTrips(routes: { route_id: string; trip_id: string }[]) {
    return this.snapshot(client => countMappedTrips(client, routes));
  }

  async prepare(manifest: GeoManifest) {
    const { operationId, tripId, routes, poiIds } = manifest;
    if (!routes.length || new Set(routes.map(r => r.route_id)).size !== routes.length
      || new Set(routes.map(r => r.day_id)).size !== routes.length || new Set(poiIds).size !== poiIds.length) {
      throw new BffProblem('PUBLICATION_PRECONDITION_FAILED');
    }
    await this.database.transaction(async (client) => {
      const { rowCount } = await client.query(
        `INSERT INTO geo.route_hold_batches (travel_operation_id, trip_id, manifest_hash)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [operationId, tripId, manifestHash(manifest)],
      );
      if (!rowCount) {
        await lockBatch(client, operationId, tripId);
        await heldSummaries(client, [manifest], true);
        return;
      }
      await retainRoutes(client, manifest);
      await selectedPois(client, manifest, true);
      await client.query(
        'INSERT INTO geo.route_hold_batch_pois (travel_operation_id, poi_id) SELECT $1, unnest($2::uuid[])',
        [operationId, poiIds],
      );
    });
  }

  private async snapshot<T>(read: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      return read(client);
    });
  }

  async verify(manifest: GeoManifest) {
    return this.snapshot(async (client) => {
      const [summary] = await heldSummaries(client, [manifest], true);
      if (!summary) {
        throw new BffProblem('POI_PUBLICATION_RESTRICTED');
      }
      await selectedPois(client, manifest, true);
      return { start: summary.start, tripType: await tripType(client, manifest.operationId) };
    });
  }

  async release(operationId: string, tripId: string) {
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO geo.route_hold_batches (travel_operation_id, trip_id, released_at)
         VALUES ($1,$2,clock_timestamp()) ON CONFLICT DO NOTHING`,
        [operationId, tripId],
      );
      const batch = await lockBatch(client, operationId, tripId);
      if (!batch.active) {
        return;
      }
      await client.query('DELETE FROM geo.route_geometry_holds WHERE travel_operation_id = $1', [operationId]);
      await client.query('DELETE FROM geo.route_hold_batch_pois WHERE travel_operation_id = $1', [operationId]);
      await client.query(
        'UPDATE geo.route_hold_batches SET released_at = greatest(created_at, clock_timestamp()) WHERE travel_operation_id = $1',
        [operationId],
      );
    });
  }

  async read(manifest: GeoManifest) {
    return this.snapshot(async (client) => {
      const [summary] = await heldSummaries(client, [manifest]);
      if (!summary) {
        return null;
      }
      const days = await publicDays(client, manifest);
      const pois = await selectedPois(client, manifest, false);
      return { ...summary, days, pois };
    });
  }

  async readOwnedSummaries(userId: string, trips: OwnedRouteSet[]) {
    const routes = trips.filter(trip => trip.route_ids.length);
    if (!routes.length) {
      return new Map<string, OwnedRouteSummary>();
    }
    return this.snapshot(client => ownedRouteSummaries(client, userId, routes.map(({ trip_id, route_ids, archived }) => ({ trip_id, route_ids, archived }))));
  }

  async readSummaries(manifests: GeoManifest[]) {
    return this.snapshot(client => heldSummaries(client, manifests));
  }
}
