import { createHash } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { RouteService } from '../src/geo/routes/route.service.js';
import { BffProblem } from '../src/http/bff-problem.js';
import { IdentityService } from '../src/identity/identity.service.js';
import { CatalogService } from '../src/publication/catalog.service.js';
import { publishInput } from '../src/publication/publication-input.js';
import { PublicationWorker } from '../src/publication/publication-worker.js';
import { parsePersonalEquipment } from '../src/travel/equipment/equipment-input.js';
import { EquipmentLibrary } from '../src/travel/equipment/equipment-library.service.js';
import { PublicCatalog } from '../src/travel/public-catalog.js';
import { PublicationService } from '../src/travel/publication.service.js';
import { TravelDatabase } from '../src/travel/travel-database.js';
import {
  createTripInput,
  dayInput,
  updateTripInput,
} from '../src/travel/travel-input.js';
import { TravelService } from '../src/travel/travel.service.js';
import type { TravelEditor } from '../src/travel/travel.service.js';
import { recordLifecycle } from '../src/travel/trip-lifecycle.js';
import type { TripLifecycle } from '../src/travel/trip-lifecycle.js';

interface DemoStop {
  name: string;
  lon: number;
  lat: number;
}

interface DemoTrip {
  id: string;
  slug: string;
  owner: string;
  status: string;
  title: string;
  summary: string;
  startDate: string | null;
  timezone: string;
  transportMode: string;
  difficulty: string;
  freeCapacity: number;
  admissionMode: string;
  equipment?: { label: string; required: boolean }[];
  days: { description: string; stops: DemoStop[] }[];
}

interface TravelVersion {
  version: number;
  organizer: { id: string; email: string; displayName: string };
  trips: DemoTrip[];
}

interface EquipmentVersion {
  version: number;
  personalEquipment: {
    label: string;
    icon?: string;
    group?: { label: string };
    subgroup?: { label: string };
  }[];
}

interface AccountTripsVersion {
  version: number;
  accountTrips: {
    archive: { id: string; title: string; description: string };
    favorites: string[];
    participation: { tripId: string; mode: 'open' | 'request' }[];
  };
}

interface TravelersVersion {
  version: number;
  travelers: TravelVersion['organizer'][];
}

interface AvatarsVersion {
  version: number;
  initialAvatarId: string;
  avatars: { userId: string; avatarId: string }[];
}

interface Journey {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  startsInDays: number;
  timezone: string;
  transportMode: string;
  freeCapacity: number;
  admissionMode: 'open' | 'request';
  lifecycle: TripLifecycle;
  stops: DemoStop[];
  confirmed?: string[];
  pending?: string[];
  favorite?: boolean;
}

interface JourneysVersion {
  version: number;
  journeys: Journey[];
}

export type DemoVersion = EquipmentVersion | TravelVersion | AccountTripsVersion | TravelersVersion | JourneysVersion | AvatarsVersion;

interface DemoContext {
  identityUrl: string;
  travelUrl: string;
  geoUrl: string;
  travelerId: string;
  startedAt: Date;
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
        return latest.trip_revision_id;
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
  return operation.trip_revision_id;
}

async function seedPersonalEquipment(library: EquipmentLibrary, editor: TravelEditor, version: EquipmentVersion) {
  for (const [index, fields] of version.personalEquipment.entries()) {
    for (let attempt = 0; ; attempt++) {
      const suffix = attempt === 0 ? '' : attempt === 1 ? ' (пример)' : ` (пример ${attempt})`;
      const input = parsePersonalEquipment({ ...fields, label: fields.label + suffix });
      const key = commandKey(editor.userId, version.version, `equipment/${index}/${attempt}`);
      try {
        const item = await library.add(editor, key, input);
        if (item.scope === 'personal' && item.icon === fields.icon
          && item.group?.label.toLowerCase() === fields.group?.label.toLowerCase()
          && item.subgroup?.label.toLowerCase() === fields.subgroup?.label.toLowerCase()) {
          break;
        }
      }
      catch (error) {
        if (!(error instanceof BffProblem) || error.code !== 'EQUIPMENT_DETAILS_CONFLICT') {
          throw error;
        }
      }
    }
  }
}

async function unlessTripChanged(operation: Promise<unknown>, skip: BffProblem['code'][]) {
  try {
    await operation;
  }
  catch (error) {
    if (!(error instanceof BffProblem) || !skip.includes(error.code)) {
      throw error;
    }
  }
}

async function prepareTripSeeder(application: INestApplicationContext, version: number) {
  const geo = application.get(RouteService);
  const travel = application.get(TravelService);
  const publications = application.get(PublicationService);
  const worker = application.get(PublicationWorker);
  const { difficulties } = await application.get(PublicCatalog).filterOptions();
  return async (editor: TravelEditor, trip: Omit<DemoTrip, 'owner' | 'slug'>) => {
    const difficulty = difficulties.find(level => level.value === trip.difficulty);
    if (!difficulty || !trip.days.length || !['published', 'draft'].includes(trip.status)) {
      throw new Error(`Некорректные поля демопоездки ${trip.id}`);
    }
    const key = (action: string) => commandKey(trip.id, version, action);
    const dateForDay = (index: number) => trip.startDate && localDate(trip.startDate, index);
    const fields = createTripInput({
      title: trip.title,
      description: trip.summary,
      start_date: trip.startDate,
      end_date: dateForDay(trip.days.length - 1),
      timezone: trip.timezone,
      difficulty: difficulty.label,
      free_capacity: trip.freeCapacity,
      admission_mode: trip.admissionMode,
      ...(trip.equipment && { equipment: trip.equipment }),
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
        local_date: dateForDay(index),
      }, true);
      draft = index === 0
        ? await travel.updateDay(editor, draft.days[0]!.day_id, key('first-day'), input)
        : await travel.createDay(editor, trip.id, key(`day/${index}`), input);
      const dayId = draft.days[index]!.day_id;
      draft = await travel.bindRoute(editor, dayId, key(`bind/${index}`), { trip_revision_id: draft.trip_revision_id });
      const routeId = draft.days[index]!.route_id!;
      const geometry = await geo.replace(editor.userId, routeId, key(`geometry/${index}`), {
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
      const revision = await publishDemoTrip(publications, worker, editor, trip.id, publishInput({
        trip_revision_id: draft.trip_revision_id,
        routes,
        poi_ids: [],
      }), key('publish'));
      return { revision, routes };
    }
  };
}

async function seedJourneyRelations(
  database: TravelDatabase, catalog: CatalogService, journey: Journey, travelerId: string, owner: (id: string) => TravelEditor,
) {
  const history = await database.transaction(async (client) => {
    const { rows } = await client.query<{ user_id: string; state: 'finished' | 'pending' | 'favorite'; id: string | null }>(
      `SELECT user_id, 'finished' AS state, id FROM travel.trip_participants WHERE trip_id = $1
       UNION ALL SELECT applicant_user_id, CASE WHEN status = 'pending' THEN 'pending' ELSE 'finished' END, id
         FROM travel.trip_applications WHERE trip_id = $1
       UNION ALL SELECT user_id, 'favorite', NULL FROM travel.trip_favorites WHERE trip_id = $1 AND user_id = $2
       UNION ALL SELECT actor_user_id, 'favorite', NULL FROM travel.trip_audit_events
         WHERE trip_id = $1 AND actor_user_id = $2 AND action IN ('trip.favorite.add', 'trip.favorite.remove')`,
      [journey.id, travelerId],
    );
    return rows;
  });
  const decided = new Set(history.filter(item => item.state === 'finished').map(item => item.user_id));
  const pending = new Map(history.filter(item => item.state === 'pending').map(item => [item.user_id, item.id!]));
  const editor = owner(journey.ownerId);
  for (const userId of journey.confirmed ?? []) {
    if (decided.has(userId)) {
      continue;
    }
    let requestId = pending.get(userId);
    if (!requestId) {
      const result = await catalog.apply(journey.id, owner(userId), journey.admissionMode);
      if (result.status === 'joined') {
        continue;
      }
      const { items } = await catalog.roster(journey.id, editor.userId);
      requestId = items.find(item => item.user_id === userId && item.status === 'pending')?.id;
    }
    if (requestId) {
      await catalog.decideRoster(journey.id, editor, requestId, 'accept');
    }
  }
  for (const userId of journey.pending ?? []) {
    if (!decided.has(userId) && !pending.has(userId)) {
      await catalog.apply(journey.id, owner(userId), 'request');
    }
  }
  if (journey.favorite && !history.some(item => item.state === 'favorite')) {
    await catalog.setFavorite(journey.id, owner(travelerId), true);
  }
}

async function seedJourney(
  application: INestApplicationContext, seedTrip: Awaited<ReturnType<typeof prepareTripSeeder>>, journey: Journey,
  context: DemoContext, version: number, owner: (id: string) => TravelEditor,
) {
  const travel = application.get(TravelService);
  const database = application.get(TravelDatabase);
  const editor = owner(journey.ownerId);
  const key = (action: string) => commandKey(journey.id, version, action);
  try {
    const trip = await seedTrip(editor, {
      id: journey.id,
      title: journey.title,
      summary: journey.description,
      startDate: null,
      timezone: journey.timezone,
      difficulty: 'easy',
      transportMode: journey.transportMode,
      freeCapacity: journey.freeCapacity,
      admissionMode: journey.admissionMode,
      days: [{ description: journey.description, stops: journey.stops }],
      status: 'published',
    });
    if (!trip) {
      throw new Error(`Не удалось опубликовать демопоездку ${journey.id}`);
    }
    const draft = await travel.readDraft(editor.userId, journey.id);
    if (draft.trip_revision_id === trip.revision) {
      await seedJourneyRelations(database, application.get(CatalogService), journey, context.travelerId, owner);
    }
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: journey.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(context.startedAt);
    const startDate = localDate(date, journey.startsInDays);
    const scheduled = await travel.updateTrip(editor, journey.id, key('schedule'), updateTripInput({
      trip_revision_id: trip.revision,
      start_date: startDate,
      end_date: startDate,
    }));
    const datedDay = await travel.updateDay(editor, scheduled.days[0]!.day_id, key('day-date'), dayInput({
      trip_revision_id: scheduled.trip_revision_id,
      local_date: startDate,
    }, true));
    const revision = await publishDemoTrip(application.get(PublicationService), application.get(PublicationWorker), editor, journey.id,
      publishInput({ trip_revision_id: datedDay.trip_revision_id, routes: trip.routes, poi_ids: [] }), key('dated-publication'));
    if (journey.lifecycle !== 'planned') {
      await recordLifecycle(database, editor, journey.id, key('lifecycle'), revision, journey.lifecycle);
    }
  }
  catch (error) {
    if (!(error instanceof BffProblem) || !['NOT_FOUND', 'IDEMPOTENCY_KEY_REUSED', 'TRIP_REVISION_CONFLICT', 'ROUTE_REVISION_CONFLICT'].includes(error.code)) {
      throw error;
    }
    const started = await database.transaction(async client => client.query(
      `SELECT FROM travel.trips t JOIN travel.draft_commands d ON d.trip_id = t.id
       WHERE t.id = $1 AND t.owner_user_id = $2 AND d.action = 'trip.create' AND d.idempotency_key = $3
       AND (t.archived_at IS NOT NULL OR $4 IN ('TRIP_REVISION_CONFLICT', 'ROUTE_REVISION_CONFLICT')
            OR ($4 = 'NOT_FOUND' AND t.visibility = 'private' AND EXISTS (
         SELECT FROM travel.route_operations o WHERE o.trip_id = t.id AND o.kind = 'publish' AND o.status = 'succeeded'
       )))`, [journey.id, editor.userId, key('create'), error.code],
    ));
    if (!started.rowCount) {
      throw error;
    }
  }
}

export async function applyTravelDemoVersion(context: DemoContext, version: Exclude<DemoVersion, TravelersVersion>) {
  const application = await NestFactory.createApplicationContext(AppModule.configure(
    { databaseUrl: context.identityUrl },
    { databaseUrl: context.travelUrl, publicationWorker: false },
    { databaseUrl: context.geoUrl, providers: { demManifestPath: '' } },
  ), { logger: false, abortOnError: false });
  try {
    const identity = application.get(IdentityService);
    if ('avatars' in version) {
      await identity.replaceInitialAvatars(version.initialAvatarId, version.avatars);
      return;
    }
    const owner = (userId: string): TravelEditor => ({ userId, confirmSession: async () => {
      await identity.getPublicProfile(userId);
    } });
    if ('personalEquipment' in version) {
      await seedPersonalEquipment(application.get(EquipmentLibrary), owner(context.travelerId), version);
      return;
    }
    const travel = application.get(TravelService);
    const publications = application.get(PublicationService);
    if ('accountTrips' in version) {
      const catalog = application.get(CatalogService);
      const editor = owner(context.travelerId);
      const { archive, favorites, participation } = version.accountTrips;
      const key = (action: string) => commandKey(archive.id, version.version, action);
      const fields = createTripInput({ title: archive.title, description: archive.description });
      const draft = await travel.createTrip(editor, key('create'), fields, archive.id);
      await unlessTripChanged(publications.archive(editor, archive.id, key('archive'), {
        trip_revision_id: draft.trip_revision_id,
      }), ['NOT_FOUND', 'TRIP_REVISION_CONFLICT']);
      for (const tripId of favorites) {
        await unlessTripChanged(catalog.setFavorite(tripId, editor, true), ['NOT_FOUND']);
      }
      const current = await catalog.participation(editor.userId, participation.map(item => item.tripId));
      const participating = new Set([...current.trip_ids, ...current.joined_trip_ids]);
      for (const { tripId, mode } of participation) {
        if (!participating.has(tripId)) {
          await unlessTripChanged(catalog.apply(tripId, editor, mode), ['NOT_FOUND', 'TRIP_APPLICATION_UNAVAILABLE']);
        }
      }
      return;
    }
    const seedTrip = await prepareTripSeeder(application, version.version);
    if ('journeys' in version) {
      for (const journey of version.journeys) {
        await seedJourney(application, seedTrip, journey, context, version.version, owner);
      }
      return;
    }
    for (const trip of version.trips) {
      if (!['company', 'traveler'].includes(trip.owner)) {
        throw new Error(`Некорректный организатор демопоездки ${trip.id}`);
      }
      const userId = trip.owner === 'company' ? version.organizer.id : context.travelerId;
      await seedTrip(owner(userId), trip);
    }
  }
  finally {
    await application.close();
  }
}
