import account from '../../../../../fixtures/demo-account.json';
import type firstVersion from '../../../../../fixtures/demo/0001-travel.json';

type DemoVersion = typeof firstVersion;

function presentTrip(trip: DemoVersion['trips'][number], organizer: DemoVersion['organizer']) {
  const mode = trip.transportMode;
  if (mode !== 'car' && mode !== 'bicycle' && mode !== 'foot') {
    throw new Error('Неизвестный тип маршрута');
  }
  if (!['company', 'traveler'].includes(trip.owner) || !['published', 'draft'].includes(trip.status)) {
    throw new Error('Неизвестный организатор или статус поездки ' + trip.id);
  }
  const end = new Date(trip.startDate + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + trip.days.length - 1);
  const owner = trip.owner === 'company' ? organizer : account;
  return {
    ...trip,
    organizerId: owner.id,
    organizerName: owner.displayName,
    facts: {
      start_date: trip.startDate,
      end_date: end.toISOString().slice(0, 10),
      trip_type: mode,
      free_capacity: trip.freeCapacity,
      confirmed_participants: 0,
      day_count: trip.days.length,
    } as const,
  };
}

export type DemoTrip = ReturnType<typeof presentTrip>;

export function buildDemoCatalog(files: Record<string, DemoVersion>) {
  const paths = Object.keys(files).sort();
  if (!paths.length) {
    throw new Error('Нет версий демонстрационных данных.');
  }
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const trips = paths.flatMap((path, index) => {
    const data = files[path]!;
    const filename = path.split('/').at(-1)!;
    if (!/^\d{4}-[a-z][a-z0-9-]*\.json$/.test(filename) || Number(filename.slice(0, 4)) !== index + 1
      || data.version !== index + 1) {
      throw new Error('Некорректная версия демонстрационных данных: ' + filename);
    }
    return data.trips.map((trip) => {
      const id = trip.id.toLowerCase();
      if (ids.has(id) || slugs.has(trip.slug)) {
        throw new Error('Повтор UUID или slug демонстрационной поездки: ' + trip.slug);
      }
      ids.add(id);
      slugs.add(trip.slug);
      return presentTrip(trip, data.organizer);
    });
  });
  return {
    demoTrips: trips.filter(trip => trip.status === 'published'),
    myDemoTrips: trips.filter(trip => trip.owner === 'traveler'),
  };
}

const versions = import.meta.glob<DemoVersion>('../../../../../fixtures/demo/*.json', { eager: true, import: 'default' });
export const { demoTrips, myDemoTrips } = buildDemoCatalog(versions);
