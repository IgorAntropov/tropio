import { Inject, Injectable } from '@nestjs/common'
import { ServiceDatabase } from '../database/service-database.js'
import { TRAVEL_DATABASE_URL } from './travel.config.js'

@Injectable()
export class TravelDatabase extends ServiceDatabase {
  constructor(@Inject(TRAVEL_DATABASE_URL) databaseUrl?: string) {
    super(databaseUrl, 'tropio_travel_runtime')
  }
}
