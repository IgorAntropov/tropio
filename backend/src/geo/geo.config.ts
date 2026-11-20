import type { GeoProvidersOptions } from './providers/index.js'

export interface GeoOptions {
  databaseUrl?: string
  providers?: GeoProvidersOptions
}

export const GEO_OPTIONS = Symbol('Geo options')
