export const tripListPageSize = 12;

export function tripListBatch(remainingPages: number) {
  const pages = Math.min(remainingPages, Math.floor(100 / tripListPageSize));
  return { pages, limit: pages * tripListPageSize };
}
