import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { RouteService } from '../src/geo/routes/route.service.js';
import { IdentityService } from '../src/identity/identity.service.js';
import { publishInput } from '../src/publication/publication-input.js';
import { PublicationWorker } from '../src/publication/publication-worker.js';
import { PublicCatalog } from '../src/travel/public-catalog.js';
import { PublicationService } from '../src/travel/publication.service.js';
import {
  createTripInput,
  dayInput,
  updateTripInput,
} from '../src/travel/travel-input.js';
import { TravelService } from '../src/travel/travel.service.js';
import type { TravelEditor } from '../src/travel/travel.service.js';

interface DemoStop {
  name: string;
  lon: number;
  lat: number;
}

interface DemoTrip {
  id: string;
  owner: string;
  status: string;
  title: string;
  summary: string;
  startDate: string;
  timezone: string;
  transportMode: string;
  difficulty: string;
  freeCapacity: number;
  admissionMode: string;
  days: { description: string; stops: DemoStop[] }[];
}

interface DemoVersion {
  version: number;
  organizer: { id: string };
  trips: DemoTrip[];
}

interface DemoContext {
  identityUrl: string;
  travelUrl: string;
  geoUrl: string;
  travelerId: string;
}

function commandKey(tripId: string, version: number, action: string) {
  const bytes = createHash('sha256').update(`tropio/demo/${version}/${tripId}/${action}`).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex', 0, 16);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function localDate(start: string, offset: number) {
  const date = new Date(start + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export async function publishDemoTrip(
  publications: Pick<PublicationService, 'publish' | 'status'>, worker: Pick<PublicationWorker, 'prepare'>, editor: TravelEditor, tripId: string,
  command: ReturnType<typeof publishInput>, initialKey: string,
) {
  const retryUntil = Date.now() + 120_000;
  let delay = 1000;
  let operation = await publications.publish(editor, tripId, initialKey, command);
  while (operation.status !== 'succeeded') {
    if (Date.now() >= retryUntil) {
      const latest = await publications.status(editor.userId, tripId, operation.operation_id);
      if (latest.status === 'succeeded') {
        return;
      }
      throw new Error(`Истекло время ожидания публикации демопоездки ${tripId}`);
    }
    if (operation.status === 'failed') {
      if (operation.code !== 'PUBLICATION_TIMED_OUT') {
        throw new Error(`Публикация демопоездки ${tripId}: ${operation.code}`);
      }
      operation = await publications.publish(editor, tripId, operation.operation_id, command);
      delay = 1000;
      continue;
    }
    await worker.prepare({ id: operation.operation_id, trip_id: tripId });
    operation = await publications.status(editor.userId, tripId, operation.operation_id);
    if (operation.status === 'pending') {
      await new Promise(resolve => setTimeout(resolve, Math.min(delay, retryUntil - Date.now())));
      delay = Math.min(delay * 2, 32_000);
    }
  }
}

export async function applyTravelDemoVersion(context: DemoContext, version: DemoVersion) {
  const application = await NestFactory.createApplicationContext(AppModule.configure(
    { databaseUrl: context.identityUrl },
    { databaseUrl: context.travelUrl, publicationWorker: false },
    { databaseUrl: context.geoUrl, providers: { demManifestPath: '' } },
  ), { logger: false, abortOnError: false });
  try {
    const identity = application.get(IdentityService);
    const travel = application.get(TravelService);
    const geo = application.get(RouteService);
    const publications = application.get(PublicationService);
    const worker = application.get(PublicationWorker);
    const { difficulties } = await application.get(PublicCatalog).filterOptions();

    for (const trip of version.trips) {
      const difficulty = difficulties.find(level => level.value === trip.difficulty);
      if (!difficulty || !trip.days.length || !['company', 'traveler'].includes(trip.owner)
        || !['published', 'draft'].includes(trip.status)) {
        throw new Error(`Некорректные поля демопоездки ${trip.id}`);
      }
      const userId = trip.owner === 'company' ? version.organizer.id : context.travelerId;
      const editor = { userId, confirmSession: async () => {
        await identity.getPublicProfile(userId);
      } };
      const key = (action: string) => commandKey(trip.id, version.version, action);
      const fields = createTripInput({
        title: trip.title,
        description: trip.summary,
        start_date: trip.startDate,
        end_date: localDate(trip.startDate, trip.days.length - 1),
        timezone: trip.timezone,
        difficulty: difficulty.label,
        free_capacity: trip.freeCapacity,
        admission_mode: trip.admissionMode,
      });
      let draft = await travel.createTrip(editor, key('create'), fields, trip.id);
      const routes: ReturnType<typeof publishInput>['routes'] = [];
      for (const [index, day] of trip.days.entries()) {
        if (day.stops.length < 2) {
          throw new Error(`День ${index + 1} демопоездки ${trip.id} требует двух остановок`);
        }
        const input = dayInput({
          trip_revision_id: draft.trip_revision_id,
          description: day.description,
          local_date: localDate(trip.startDate, index),
        }, true);
        draft = index === 0
          ? await travel.updateDay(editor, draft.days[0]!.day_id, key('first-day'), input)
          : await travel.createDay(editor, trip.id, key(`day/${index}`), input);
        const dayId = draft.days[index]!.day_id;
        draft = await travel.bindRoute(editor, dayId, key(`bind/${index}`), { trip_revision_id: draft.trip_revision_id });
        const routeId = draft.days[index]!.route_id!;
        const geometry = await geo.replace(userId, routeId, key(`geometry/${index}`), {
          route_revision_id: null,
          points: day.stops.map(({ name, lon, lat }) => ({ name, position: { lon, lat } })),
          tracks: day.stops.slice(1).map(() => ({ build_mode: 'straight', transport_mode: trip.transportMode })),
        });
        routes.push({ day_id: dayId, route_id: routeId, route_revision_id: geometry.route_revision_id! });
      }
      if (trip.status === 'published') {
        draft = await travel.updateTrip(editor, trip.id, key('public'), updateTripInput({
          trip_revision_id: draft.trip_revision_id,
          visibility: 'public',
        }));
        await publishDemoTrip(publications, worker, editor, trip.id, publishInput({
          trip_revision_id: draft.trip_revision_id,
          routes,
          poi_ids: [],
        }), key('publish'));
      }
    }
  }
  finally {
    await application.close();
  }
}
