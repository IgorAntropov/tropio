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

async function withLocalRuntime(database, service, run) {
  const url = postgresEndpoint()
  const login = `tropio_${service}_${randomBytes(12).toString('hex')}`
  const password = randomBytes(32).toString('hex')
  composeSql(`
CREATE ROLE ${login} LOGIN PASSWORD '${password}';
GRANT tropio_${service}_runtime TO ${login};
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

async function testService(service) {
  const database = `tropio_${service}_test_${randomBytes(8).toString('hex')}`
  composeSql(`CREATE DATABASE ${database} TEMPLATE template0;`)
  try {
    applyMigrations({ database })
    return await withLocalRuntime(database, 'identity', (identityUrl) => {
      const args = ['--filter', '@tropio/backend', 'exec', 'vitest', 'run', `test/${service}-http.test.ts`]
      const env = { TROPIO_IDENTITY_TEST_DATABASE_URL: identityUrl }
      if (service === 'identity') return runPnpm(args, env)
      return withLocalRuntime(database, 'travel', travelUrl =>
        runPnpm(args, { ...env, TROPIO_TRAVEL_TEST_DATABASE_URL: travelUrl }))
    })
  } finally {
    composeSql(`DROP DATABASE ${database};`)
  }
}

async function startDevelopment() {
  const proxySecret = process.env.TROPIO_BFF_PROXY_SECRET || randomBytes(32).toString('hex')
  const run = (identityUrl, travelUrl) => runPnpm(['run', 'dev'], {
    TROPIO_IDENTITY_DATABASE_URL: identityUrl,
    TROPIO_TRAVEL_DATABASE_URL: travelUrl,
    TROPIO_AUTH_OUTBOX_DIR: process.env.TROPIO_AUTH_OUTBOX_DIR || resolve(root, '.local/identity-mail'),
    TROPIO_BFF_PROXY_SECRET: proxySecret,
    NUXT_BFF_PROXY_SECRET: proxySecret,
  })
  const identityUrl = process.env.TROPIO_IDENTITY_DATABASE_URL
  const travelUrl = process.env.TROPIO_TRAVEL_DATABASE_URL
  if (identityUrl && travelUrl) return run(identityUrl, travelUrl)
  const database = composeSql('COPY (SELECT current_database()) TO STDOUT;')
  const withTravel = (activeIdentityUrl) => travelUrl
    ? run(activeIdentityUrl, travelUrl)
    : withLocalRuntime(database, 'travel', activeTravelUrl => run(activeIdentityUrl, activeTravelUrl))
  return identityUrl ? withTravel(identityUrl) : withLocalRuntime(database, 'identity', withTravel)
}

const command = process.argv[2]
if (!['dev', 'test', 'test-travel'].includes(command)) throw new Error('Укажи dev, test или test-travel')
process.exitCode = await (command === 'dev' ? startDevelopment() : testService(command === 'test' ? 'identity' : 'travel'))
