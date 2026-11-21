export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export function imageType(value: unknown): ImageType | undefined {
  if (value === 'image/jpeg' || value === 'image/png' || value === 'image/webp') {
    return value;
  }
}

export function isImage(bytes: Buffer, type: ImageType): boolean {
  if (type === 'image/jpeg') {
    return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  }
  if (type === 'image/png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
}
