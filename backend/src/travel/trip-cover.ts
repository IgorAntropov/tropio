import type { PoolClient } from 'pg';
import { BffProblem } from '../http/bff-problem.js';
import type { ImageType } from '../http/image-format.js';
import { readImageUpload } from '../http/image-upload.js';
import type { CoverUpload } from './travel-input.js';

export interface TripCoverFile {
  content_type: ImageType;
  bytes: Buffer;
}

export async function decodeCover(input: CoverUpload): Promise<TripCoverFile> {
  const { bytes, image } = await readImageUpload(input);
  try {
    await image.stats();
  }
  catch {
    throw new BffProblem('INVALID_REQUEST');
  }
  return { bytes, content_type: input.content_type };
}

export async function storeCover(client: PoolClient, tripId: string, image: TripCoverFile) {
  const { rows: [row] } = await client.query<{ id: string }>(
    'INSERT INTO travel.trip_covers (trip_id, content_type, bytes) VALUES ($1, $2, $3) RETURNING id',
    [tripId, image.content_type, image.bytes],
  );
  return row!.id;
}
