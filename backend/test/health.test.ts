import type { NestNodeApplication } from '@nestjs/platform-node'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createApplication } from '../src/create-application.js'

let app: NestNodeApplication | undefined
let endpoint: string

beforeAll(async () => {
  app = await createApplication({ logger: false })
  await app.listen(0, '127.0.0.1')
  endpoint = await app.getUrl()
})

afterAll(async () => {
  await app?.close()
})

it('exposes BFF health at the versioned API path', async () => {
  const response = await fetch(`${endpoint}/api/v1/health`)

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})
