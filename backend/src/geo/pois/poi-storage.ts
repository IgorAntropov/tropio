import { createHash, createHmac } from 'node:crypto'
import process from 'node:process'
import { BffProblem } from '../../http/bff-problem.js'

type ImageType = 'image/jpeg' | 'image/png' | 'image/webp'

const payloadHash = createHash('sha256').update('').digest('hex')
const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
const maxBytes = 10 * 1024 * 1024

function pathPart(part: string): string {
  return encodeURIComponent(part).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function storageRequest(objectKey: string) {
  const accessKey = process.env.TROPIO_S3_ACCESS_KEY_ID
  const secret = process.env.TROPIO_S3_SECRET_ACCESS_KEY
  const bucket = process.env.TROPIO_S3_BUCKET || 'tropio-media'
  const region = process.env.TROPIO_S3_REGION || 'us-east-1'
  const base = new URL(process.env.TROPIO_S3_URL || `http://127.0.0.1:${process.env.TROPIO_S3_PORT || '8333'}`)
  if (!accessKey || !secret || !['http:', 'https:'].includes(base.protocol) || base.username
    || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new BffProblem('DEPENDENCY_UNAVAILABLE')
  }
  const segments = objectKey.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new BffProblem('NOT_FOUND')

  base.pathname = '/' + [bucket, ...segments].map(pathPart).join('/')
  const date = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')
  const day = date.slice(0, 8)
  const scope = `${day}/${region}/s3/aws4_request`
  const canonicalHeaders = `host:${base.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\n`
  const request = ['GET', base.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secret, day), region), 's3'), 'aws4_request')
  const signature = hmac(signingKey, ['AWS4-HMAC-SHA256', date, scope, createHash('sha256').update(request).digest('hex')].join('\n'))
  return {
    url: base,
    headers: {
      'x-amz-date': date,
      'x-amz-content-sha256': payloadHash,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature.toString('hex')}`,
    },
  }
}

export function imageType(value: string): ImageType | undefined {
  if (value === 'image/jpeg' || value === 'image/png' || value === 'image/webp') return value
}

export function isImage(bytes: Buffer, type: ImageType): boolean {
  if (type === 'image/jpeg') return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
}

export async function readPrivatePoiMedia(objectKey: string, contentType: ImageType): Promise<Buffer> {
  let response: Response
  try {
    const { url, headers } = storageRequest(objectKey)
    response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(5000) })
  } catch (error) {
    if (error instanceof BffProblem) throw error
    throw new BffProblem('DEPENDENCY_UNAVAILABLE')
  }

  if (!response.ok) {
    await response.body?.cancel()
    throw new BffProblem(response.status === 404 ? 'NOT_FOUND' : 'DEPENDENCY_UNAVAILABLE')
  }

  const suppliedType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const reader = response.body?.getReader()
  if (!reader) throw new BffProblem('NOT_FOUND')
  try {
    if (Number(response.headers.get('content-length')) > maxBytes
      || (suppliedType && suppliedType !== 'application/octet-stream' && suppliedType !== contentType)) {
      await reader.cancel()
      throw new BffProblem('NOT_FOUND')
    }
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw new BffProblem('NOT_FOUND')
      }
      chunks.push(part.value)
    }
    const bytes = Buffer.concat(chunks, length)
    if (!isImage(bytes, contentType)) throw new BffProblem('NOT_FOUND')
    return bytes
  } catch (error) {
    if (error instanceof BffProblem) throw error
    throw new BffProblem('DEPENDENCY_UNAVAILABLE')
  } finally {
    reader.releaseLock()
  }
}
