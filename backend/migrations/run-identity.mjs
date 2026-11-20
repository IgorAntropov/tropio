import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { composeSql } from './compose-sql.mjs'
import { applyMigrations } from './migrate.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))

function postgresEndpoint() {
  const result = spawnSync('docker', ['compose', 'port', 'postgres', '5432'], {
    cwd: root,
    encoding: 'utf8',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error('Запусти PostgreSQL командой docker compose up -d --wait postgres')
  }

  return new URL(`postgresql://${result.stdout.trim()}`)
}

async function runPnpm(args, env) {
  const child = spawn('pnpm', args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' })
  const interrupt = () => child.kill('SIGINT')
  const terminate = () => child.kill('SIGTERM')

  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  try {
    const [code, signal] = await once(child, 'exit')
    return code ?? (signal === 'SIGINT' ? 130 : 1)
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}

async function withLocalRuntime(database, run) {
  const url = postgresEndpoint()
  const login = `tropio_identity_${randomBytes(12).toString('hex')}`
  const password = randomBytes(32).toString('hex')
  composeSql(`
CREATE ROLE ${login} LOGIN PASSWORD '${password}';
GRANT tropio_identity_runtime TO ${login};
`, { transaction: true })

  url.username = login
  url.password = password
  url.pathname = `/${database}`
  try {
    return await run(url.href)
  } finally {
    composeSql(`DROP ROLE ${login};`)
  }
}

async function testIdentity() {
  const database = `tropio_identity_test_${randomBytes(8).toString('hex')}`
  composeSql(`CREATE DATABASE ${database} TEMPLATE template0;`)
  try {
    applyMigrations({ database })
    return await withLocalRuntime(database, databaseUrl => runPnpm(
      ['--filter', '@tropio/backend', 'exec', 'vitest', 'run', 'test/identity-http.test.ts'],
      { TROPIO_IDENTITY_TEST_DATABASE_URL: databaseUrl },
    ))
  } finally {
    composeSql(`DROP DATABASE ${database};`)
  }
}

async function startDevelopment() {
  const proxySecret = process.env.TROPIO_BFF_PROXY_SECRET || randomBytes(32).toString('hex')
  const run = (databaseUrl) => runPnpm(['run', 'dev'], {
    TROPIO_IDENTITY_DATABASE_URL: databaseUrl,
    TROPIO_AUTH_OUTBOX_DIR: process.env.TROPIO_AUTH_OUTBOX_DIR || resolve(root, '.local/identity-mail'),
    TROPIO_BFF_PROXY_SECRET: proxySecret,
    NUXT_BFF_PROXY_SECRET: proxySecret,
  })
  const configuredUrl = process.env.TROPIO_IDENTITY_DATABASE_URL
  if (configuredUrl) return run(configuredUrl)
  const database = composeSql('COPY (SELECT current_database()) TO STDOUT;')
  return withLocalRuntime(database, run)
}

const command = process.argv[2]
if (command !== 'dev' && command !== 'test') throw new Error('Укажи dev или test')
process.exitCode = await (command === 'dev' ? startDevelopment() : testIdentity())
