import type { PublicTripPage } from '@fsd/shared/api';

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store');
  const origin = new URL(useRuntimeConfig(event).public.siteUrl).origin;
  const paths = new Set(['/catalog']);
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: PublicTripPage = await $fetch<PublicTripPage>('/api/v1/catalog/trips', {
      query: { limit: 100, ...(cursor ? { cursor } : {}) },
      retry: 0,
      cache: 'no-store',
    }).catch(() => {
      throw createError({ statusCode: 503, statusMessage: 'Catalog unavailable' });
    });
    for (const trip of page.items) {
      paths.add('/catalog/' + encodeURIComponent(trip.trip_id));
      if (trip.organizer) {
        paths.add('/organizers/' + encodeURIComponent(trip.organizer.id));
      }
    }
    cursor = page.next_cursor;
    if (cursor && cursors.has(cursor)) {
      throw createError({ statusCode: 503, statusMessage: 'Catalog unavailable' });
    }
    if (cursor) {
      cursors.add(cursor);
    }
  } while (cursor);
  setResponseHeader(event, 'content-type', 'application/xml; charset=UTF-8');
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    + [...paths].map(path => '<url><loc>' + origin + path + '</loc></url>').join('') + '</urlset>';
});
