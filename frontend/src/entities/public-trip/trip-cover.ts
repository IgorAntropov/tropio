import type { PublicTripSummary } from '@fsd/shared/api';

export function publicTripCover(trip: Pick<PublicTripSummary, 'trip_id' | 'cover_id'>) {
  if (!trip.cover_id) {
    return '/default-trip-cover.webp';
  }
  return `/api/v1/catalog/trips/${trip.trip_id}/covers/${trip.cover_id}`;
}
