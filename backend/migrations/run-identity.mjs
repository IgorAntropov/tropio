import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { composeSql } from './compose-sql.mjs'
import { applyMigrations } from './migrate.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const services = ['identity', 'travel', 'geo']

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

function withDatabaseRoles(database, entries, test, run, env = {}) {
  const [service, ...remaining] = entries
  if (!service) return run(env)
  const key = `TROPIO_${service.toUpperCase()}_${test ? 'TEST_' : ''}DATABASE_URL`
  const next = (url) => withDatabaseRoles(database, remaining, test, run, { ...env, [key]: url })
  const configuredUrl = test ? undefined : process.env[key]
  return configuredUrl ? next(configuredUrl) : withLocalRuntime(database, service, next)
}

async function testService(service) {
  const database = `tropio_${service}_test_${randomBytes(8).toString('hex')}`
  composeSql(`CREATE DATABASE ${database} TEMPLATE template0;`)
  try {
    applyMigrations({ database })
    const args = ['--filter', '@tropio/backend', 'exec', 'vitest', 'run', `test/${service}-http.test.ts`]
    return await withDatabaseRoles(database, service === 'publication' ? services : services.slice(0, services.indexOf(service) + 1), true,
      env => runPnpm(args, env))
  } finally {
    composeSql(`DROP DATABASE ${database};`)
  }
}

async function startDevelopment() {
  const proxySecret = process.env.TROPIO_BFF_PROXY_SECRET || randomBytes(32).toString('hex')
  const run = (env) => runPnpm(['run', 'dev'], {
    ...env,
    TROPIO_AUTH_OUTBOX_DIR: process.env.TROPIO_AUTH_OUTBOX_DIR || resolve(root, '.local/identity-mail'),
    TROPIO_BFF_PROXY_SECRET: proxySecret,
    NUXT_BFF_PROXY_SECRET: proxySecret,
  })
  const database = composeSql('COPY (SELECT current_database()) TO STDOUT;')
  return withDatabaseRoles(database, services, false, run)
}

const command = process.argv[2]
const testCommands = { test: 'identity', 'test-travel': 'travel', 'test-geo': 'geo', 'test-publication': 'publication' }
if (command !== 'dev' && !Object.hasOwn(testCommands, command)) throw new Error('Укажи dev, test, test-travel, test-geo или test-publication')
process.exitCode = await (command === 'dev' ? startDevelopment() : testService(testCommands[command]))
