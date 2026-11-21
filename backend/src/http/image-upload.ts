import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { BffProblem } from './bff-problem.js';
import { isImage } from './image-format.js';
import type { ImageType } from './image-format.js';

export interface ImageUpload {
  content_type: ImageType;
  data_base64: string;
}

const maxBytes = 2 * 1024 * 1024;

function completeImage(bytes: Buffer, type: ImageType) {
  if (!isImage(bytes, type)) {
    return false;
  }
  if (type === 'image/jpeg') {
    return bytes.readUInt16BE(bytes.length - 2) === 0xffd9;
  }
  if (type === 'image/webp') {
    return bytes.readUInt32LE(4) === bytes.length - 8;
  }
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    const chunk = bytes.toString('ascii', offset + 4, offset + 8);
    const checksumAt = offset + 8 + size;
    if (chunk === 'acTL' || checksumAt + 4 > bytes.length
      || crc32(bytes.subarray(offset + 4, checksumAt)) !== bytes.readUInt32BE(checksumAt)) {
      return false;
    }
    offset = checksumAt + 4;
    if (chunk === 'IEND') {
      return size === 0 && offset === bytes.length;
    }
  }
  return false;
}

export async function readImageUpload(input: ImageUpload) {
  if (!input.data_base64.length || input.data_base64.length > Math.ceil(maxBytes / 3) * 4) {
    throw new BffProblem('INVALID_REQUEST');
  }
  const bytes = Buffer.from(input.data_base64, 'base64');
  if (bytes.length > maxBytes || bytes.toString('base64') !== input.data_base64 || !completeImage(bytes, input.content_type)) {
    throw new BffProblem('INVALID_REQUEST');
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (input.content_type !== 'image/' + metadata.format || (metadata.pages ?? 1) !== 1) {
      throw new Error('Unsupported image');
    }
    return { bytes, image };
  }
  catch {
    throw new BffProblem('INVALID_REQUEST');
  }
}
