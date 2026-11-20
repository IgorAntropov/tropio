import type { OnModuleDestroy } from '@nestjs/common'
import pg from 'pg'
import type { PoolClient } from 'pg'
import { BffProblem } from '../http/bff-problem.js'

type RuntimeRole = 'tropio_identity_runtime' | 'tropio_travel_runtime' | 'tropio_geo_runtime'

export class ServiceDatabase implements OnModuleDestroy {
  private readonly pool?: pg.Pool

  constructor(databaseUrl: string | undefined, private readonly role: RuntimeRole) {
    if (databaseUrl) {
      this.pool = new pg.Pool({
        connectionString: databaseUrl,
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
      await client.query(`SET LOCAL ROLE ${this.role}`)
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
