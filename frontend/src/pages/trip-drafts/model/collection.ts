import type { LocationQuery } from 'vue-router';
import type {
  AccountTripCollection,
  AccountTripQuery,
  AccountTripStatus,
} from '@fsd/shared/api';

export const collections = ['created', 'participation', 'joined', 'pending', 'favorites'] as const satisfies readonly AccountTripCollection[];
export const statuses = ['draft', 'published', 'starting_soon', 'in_progress', 'completed', 'cancelled', 'archived'] as const satisfies readonly AccountTripStatus[];

export function collectionFilters(query: LocationQuery) {
  const collection = collections.find(value => value === query.collection) ?? 'all';
  const status = statuses.find(value => value === query.status) ?? 'all';
  const search = typeof query.query === 'string' ? query.query.trim() : '';
  return { collection, status, query: search } satisfies AccountTripQuery;
}
