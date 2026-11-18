import process from 'node:process'
import { createApplication } from './create-application.js'

const app = await createApplication()
app.enableShutdownHooks()

await app.listen(
  Number(process.env.BFF_PORT ?? 3001),
  process.env.BFF_HOST ?? '127.0.0.1',
)
