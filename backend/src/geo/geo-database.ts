import process from 'node:process'
import { Inject, Injectable } from '@nestjs/common'
import { ServiceDatabase } from '../database/service-database.js'
import { GEO_OPTIONS } from './geo.config.js'
import type { GeoOptions } from './geo.config.js'

@Injectable()
export class GeoDatabase extends ServiceDatabase {
  constructor(@Inject(GEO_OPTIONS) options: GeoOptions) {
    super(options.databaseUrl ?? process.env.TROPIO_GEO_DATABASE_URL, 'tropio_geo_runtime')
  }
}
