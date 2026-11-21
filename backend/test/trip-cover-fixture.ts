import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

export async function tripCover(format: 'jpeg' | 'png' | 'webp') {
  const bytes = await sharp({ create: {
    width: 16,
    height: 12,
    channels: 3,
    background: 'teal',
  } }).toFormat(format).toBuffer();
  return { content_type: 'image/' + format, data_base64: bytes.toString('base64') };
}

export async function largeTripCover() {
  const width = 384;
  const height = 384;
  const pixels = randomBytes(width * height * 3);
  const bytes = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { content_type: 'image/png', data_base64: bytes.toString('base64') };
}
