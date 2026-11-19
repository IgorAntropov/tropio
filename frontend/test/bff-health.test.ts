import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, expect, it } from 'vitest'

let upstreamStatus = 200

const upstream = createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/api/v1/health') {
    response.writeHead(404).end()
    return
  }

  response.writeHead(upstreamStatus, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ status: upstreamStatus === 200 ? 'ok' : 'unavailable' }))
})

afterAll(async () => {
  if (upstream.listening) {
    upstream.close()
    await once(upstream, 'close')
  }
})

await once(upstream.listen(0, '127.0.0.1'), 'listening')
const address = upstream.address()

if (!address || typeof address === 'string') {
  throw new Error('The BFF test server did not bind to an HTTP port')
}

await setup({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  browser: false,
  server: true,
  build: true,
  env: { NUXT_BFF_BASE_URL: `http://127.0.0.1:${address.port}` },
})

it('returns the BFF health response through the Nuxt origin', async () => {
  const response = await fetch('/api/v1/health')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})

it('renders the confirmed BFF status in the server-rendered home page', async () => {
  const response = await fetch('/')

  expect(response.status).toBe(200)
  expect(await response.text()).toContain('API работает')
})

it('renders the Russian product name in the home page and document title', async () => {
  const response = await fetch('/')
  const html = await response.text()

  expect(response.status).toBe(200)
  expect(html).toMatch(/<html\b[^>]*\blang="ru"/)
  expect(html).toContain('<title>Тропио</title>')
  expect(html).toContain('<h1>Тропио</h1>')
})

it('returns a gateway error when the BFF health check fails', async () => {
  upstreamStatus = 503

  try {
    const response = await fetch('/api/v1/health')

    expect(response.status).toBe(502)
  } finally {
    upstreamStatus = 200
  }
})
