import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const psql = [
  'export PGPASSWORD="$POSTGRES_PASSWORD"',
  'exec psql -X -w -q --set=ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${1:-$POSTGRES_DB}" "${@:2}" -f -',
].join('\n')

export function composeSql(sql, { database = '', transaction = false } = {}) {
  const options = transaction ? ['--single-transaction'] : []
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'postgres',
    'bash', '-ec', psql, 'psql', database, ...options], {
    cwd: repository,
    encoding: 'utf8',
    input: sql,
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    const details = result.stderr.trim() || result.stdout.trim() || result.signal
    throw new Error(`PostgreSQL command failed: ${details}`)
  }
  return result.stdout.trim()
}
