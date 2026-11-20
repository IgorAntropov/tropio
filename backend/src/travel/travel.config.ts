import process from 'node:process'

export interface TravelOptions {
  databaseUrl?: string
}

export const TRAVEL_DATABASE_URL = Symbol('travel database url')

export function travelDatabaseUrl(options: TravelOptions) {
  return options.databaseUrl ?? process.env.TROPIO_TRAVEL_DATABASE_URL
}
