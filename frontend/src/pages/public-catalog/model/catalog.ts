import type { LocationQuery } from 'vue-router'

export function catalogFilters(query: LocationQuery) {
  const value = (name: string) => typeof query[name] === 'string' ? query[name].trim() : ''
  return Object.fromEntries(['q', 'trip_type', 'start_date', 'end_date', 'difficulty', 'region', 'bbox']
    .map(name => [name, value(name)] as const).filter(([, item]) => item))
}
