import {
  expect,
  it,
} from 'vitest';
import dataset from '../../fixtures/demo/0001-travel.json';
import {
  buildDemoCatalog,
  demoTrips,
  myDemoTrips,
} from '../src/pages/demo-trips/model/trips';

it('publishes ten company trips and only the published traveler trip', () => {
  const firstVersionIds = new Set(dataset.trips.map(trip => trip.id));
  const published = demoTrips.filter(trip => firstVersionIds.has(trip.id));
  const personal = myDemoTrips.filter(trip => firstVersionIds.has(trip.id));
  const company = published.filter(trip => trip.owner === 'company');
  expect(company).toHaveLength(10);
  expect(company.every(trip => trip.organizerName === dataset.organizer.displayName)).toBe(true);
  expect(published).toHaveLength(11);
  expect(published.map(trip => trip.slug)).toEqual(expect.arrayContaining(['katun-terraces', 'quiet-bays', 'steppe-ridge']));
  expect(personal.map(trip => trip.status).sort()).toEqual(['draft', 'published']);
  for (const trip of personal) {
    expect(published.includes(trip)).toBe(trip.status === 'published');
  }
});

const nextTour = {
  ...dataset.trips[0]!,
  id: '42f3a2a1-acce-4717-82b7-c070979ec40a',
  slug: 'mountain-lakes',
};
const nextVersion = {
  version: 2,
  organizer: {
    id: '24e7f86d-a2e3-4693-b9a1-8c3bd8e71582',
    email: 'lake-tours@tropio.test',
    displayName: 'Бюро озёрных маршрутов',
  },
  trips: [nextTour],
};

it('appends new tour versions in order while preserving owners and visibility', () => {
  const { demoTrips: published, myDemoTrips: personal } = buildDemoCatalog({
    '0002-lakes.json': nextVersion,
    '0001-travel.json': dataset,
  });
  expect(published).toHaveLength(12);
  expect(published[0]?.organizerId).toBe(dataset.organizer.id);
  expect(published.at(-1)).toMatchObject({
    id: nextTour.id,
    organizerId: nextVersion.organizer.id,
    organizerName: nextVersion.organizer.displayName,
  });
  expect(personal.map(trip => trip.status).sort()).toEqual(['draft', 'published']);
  expect(published.some(trip => trip.status === 'draft')).toBe(false);
  expect(personal.some(trip => trip.organizerId === nextVersion.organizer.id)).toBe(false);
});

it.each([
  { ...nextTour, id: dataset.trips[0]!.id.toUpperCase() },
  { ...nextTour, slug: dataset.trips[0]!.slug },
])('rejects a version that reuses a trip UUID or a public slug', (trip) => {
  expect(() => buildDemoCatalog({
    '0001-travel.json': dataset,
    '0002-lakes.json': { ...nextVersion, trips: [trip] },
  })).toThrow('Повтор UUID или slug');
});

it('requires consecutive versions matching the file names', () => {
  expect(() => buildDemoCatalog({ '0002-lakes.json': nextVersion })).toThrow('Некорректная версия');
  expect(() => buildDemoCatalog({ '0001-travel.json': nextVersion })).toThrow('Некорректная версия');
});

it('keeps private equipment and account collections out of the published catalog sequence', () => {
  const files = {
    '0001-travel.json': dataset,
    '0004-lakes.json': { ...nextVersion, version: 4 },
  };
  const { demoTrips: published } = buildDemoCatalog(files, ['0002-personal-equipment.json', '0003-personal-trips.json']);
  expect(published.at(-1)?.id).toBe(nextTour.id);
  expect(() => buildDemoCatalog(files)).toThrow('Некорректная версия');
});

it('keeps the travel fixture identifiers, detail links and day geometry valid', () => {
  expect(dataset.version).toBe(1);
  expect(new Set(dataset.trips.map(trip => trip.id)).size).toBe(12);
  expect(new Set(dataset.trips.map(trip => trip.slug)).size).toBe(12);
  for (const trip of [...demoTrips, ...myDemoTrips]) {
    expect(trip.id).toMatch(/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/);
    expect(trip.slug).toMatch(/^[a-z\d]+(-[a-z\d]+)*$/);
    expect(trip.days.length).toBeGreaterThan(0);
    for (const day of trip.days) {
      expect(day.stops.length).toBeGreaterThanOrEqual(2);
      for (const stop of day.stops) {
        expect(Math.abs(stop.lon)).toBeLessThanOrEqual(180);
        expect(Math.abs(stop.lat)).toBeLessThanOrEqual(90);
      }
    }
  }
});
