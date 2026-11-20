import type { OnModuleDestroy } from '@nestjs/common'
import { Inject, Injectable } from '@nestjs/common'
import pg from 'pg'
import type { PoolClient } from 'pg'
import { BffProblem } from '../http/bff-problem.js'
import { IDENTITY_SETTINGS } from './identity.config.js'
import type { IdentitySettings } from './identity.config.js'

@Injectable()
export class IdentityDatabase implements OnModuleDestroy {
  private readonly pool?: pg.Pool

  constructor(@Inject(IDENTITY_SETTINGS) settings: IdentitySettings) {
    if (settings.databaseUrl) {
      this.pool = new pg.Pool({
        connectionString: settings.databaseUrl,
        connectionTimeoutMillis: 2000,
        statement_timeout: 5000,
        idle_in_transaction_session_timeout: 5000,
        max: 10,
      })
      this.pool.on('error', () => {})
    }
  }

  async transaction<T>(execute: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new BffProblem('DEPENDENCY_UNAVAILABLE')
    const client = await this.pool.connect()
    let rollbackFailed = false

    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE tropio_identity_runtime')
      await client.query('SET LOCAL search_path TO pg_catalog')
      const result = await execute(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        rollbackFailed = true
      }
      throw error
    } finally {
      client.release(rollbackFailed)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end()
  }
}
