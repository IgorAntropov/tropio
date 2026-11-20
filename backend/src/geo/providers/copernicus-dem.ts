import { createHash } from 'node:crypto';
import {
  readFile,
  stat,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  join,
} from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import type { GeoTIFFImage } from 'geotiff';
import { BffProblem } from '../../http/bff-problem.js';
import { wgs84 } from './geometry.js';
import type {
  GeoLine,
  LonLat,
} from './geometry.js';

const source = 'copernicus-dem-glo-30-public';
const verticalDatum = 'EGM2008';
const method = 'wgs84-30m-bilinear-median3-v1';
const spacingM = 30;
const maxHeightSamples = 20001;
const maxTileBytes = 64 * 1024 * 1024;
const maxManifestBytes = 2 * 1024 * 1024;

type ManifestTile = { file: string; sha256: string };
type Manifest = { source: typeof source; version: string; vertical_datum: typeof verticalDatum; tiles: Record<string, ManifestTile> };
type HeightSample = { distance_m: number; elevation_m: number | null };

export type Elevation = {
  ascent_m: number | null;
  descent_m: number | null;
  min_elevation_m: number | null;
  max_elevation_m: number | null;
  profile: HeightSample[];
  source: string | null;
  version: string | null;
  covered_distance_m: number;
  vertical_datum: typeof verticalDatum | null;
  method: string | null;
};

const missingElevation: Elevation = {
  ascent_m: null,
  descent_m: null,
  min_elevation_m: null,
  max_elevation_m: null,
  profile: [],
  source: null,
  version: null,
  covered_distance_m: 0,
  vertical_datum: null,
  method: null,
};

function remember<T>(cache: Map<string, T>, key: string, count: number, load: () => T): T {
  const cached = cache.get(key);
  if (cached !== undefined) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const entry = load();
  cache.set(key, entry);
  if (cache.size > count) {
    cache.delete(cache.keys().next().value!);
  }
  return entry;
}

function longitude(lon: number): number {
  if (lon >= -180 && lon < 180) {
    return lon;
  }
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

function tileId(lon: number, lat: number): string {
  const x = Math.floor(longitude(lon));
  const y = Math.max(Math.ceil(lat) - 1, -90);
  return `${y < 0 ? 'S' : 'N'}${String(Math.abs(y)).padStart(2, '0')}_00_${x < 0 ? 'W' : 'E'}${String(Math.abs(x)).padStart(3, '0')}_00`;
}

function gridIndex(value: number): number {
  const nearest = Math.round(value);
  return Math.abs(value - nearest) < 1e-8 ? nearest : value;
}

function interpolate(first: number | null, second: number | null, fraction: number): number | null {
  return first === null || second === null ? null : first + (second - first) * fraction;
}

function validManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const manifest = value as Partial<Manifest>;
  return manifest.source === source && manifest.vertical_datum === verticalDatum
    && typeof manifest.version === 'string' && manifest.version.trim().length > 0
    && !!manifest.tiles && typeof manifest.tiles === 'object' && !Array.isArray(manifest.tiles)
    && Object.entries(manifest.tiles).every(([tileId, entry]) =>
      /^[NS]\d{2}_00_[EW]\d{3}_00$/.test(tileId) && entry
      && typeof entry.file === 'string' && basename(entry.file) === entry.file && /^[\w.-]+\.tif$/.test(entry.file)
      && typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256));
}

async function readManifest(path: string): Promise<Manifest> {
  try {
    if ((await stat(path)).size > maxManifestBytes) {
      throw new Error('Copernicus manifest is too large');
    }
    const data: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!validManifest(data)) {
      throw new Error('Invalid Copernicus manifest');
    }
    return data;
  }
  catch {
    throw new BffProblem('DEPENDENCY_UNAVAILABLE');
  }
}

class DemTile {
  readonly west: number;
  readonly north: number;
  readonly stepLon: number;
  readonly stepLat: number;
  readonly width: number;
  readonly height: number;
  private readonly blockWidth: number;
  private readonly blockHeight: number;
  private readonly noData: number | null;
  private readonly blocks = new Map<string, Promise<ArrayLike<number> | null>>();

  constructor(private readonly image: GeoTIFFImage) {
    const [originLon, originLat] = image.getOrigin();
    const [stepLon, stepLat] = image.getResolution();
    const pixelOffset = image.pixelIsArea() ? 0.5 : 0;
    if ((image.getGeoKeys()?.GeographicTypeGeoKey ?? 0) !== 4326
      || !Number.isFinite(originLon) || !Number.isFinite(originLat) || !Number.isFinite(stepLon)
      || !Number.isFinite(stepLat) || stepLon! <= 0 || stepLat! >= 0) {
      throw new Error('Invalid Copernicus raster grid');
    }
    this.stepLon = stepLon!;
    this.stepLat = stepLat!;
    this.west = originLon! + pixelOffset * this.stepLon;
    this.north = originLat! + pixelOffset * this.stepLat;
    this.width = image.getWidth();
    this.height = image.getHeight();
    this.blockWidth = image.getTileWidth();
    this.blockHeight = image.getTileHeight();
    this.noData = image.getGDALNoData();
    if (this.width > 7201 || this.height > 7201 || this.blockWidth * this.blockHeight > 2_097_152) {
      throw new Error('Unexpected Copernicus raster dimensions');
    }
  }

  async pixel(x: number, y: number): Promise<number | null> {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }
    const left = Math.floor(x / this.blockWidth) * this.blockWidth;
    const top = Math.floor(y / this.blockHeight) * this.blockHeight;
    const right = Math.min(left + this.blockWidth, this.width);
    const bottom = Math.min(top + this.blockHeight, this.height);
    const block = await remember(this.blocks, `${left},${top}`, 8, async () => {
      try {
        return await this.image.readRasters({ window: [left, top, right, bottom], samples: [0], interleave: true });
      }
      catch {
        return null;
      }
    });
    const height = block?.[(y - top) * (right - left) + x - left];
    return height === undefined || !Number.isFinite(height) || height === this.noData ? null : height;
  }
}

function samplePositions(line: GeoLine): { distance: number; lon: number; lat: number }[] {
  if (line.length === 0) {
    return [];
  }
  const [firstLon, firstLat] = line[0]!;
  const positions = [{ distance: 0, lon: firstLon, lat: firstLat }];
  let length = 0;
  let target = spacingM;
  for (let index = 1; index < line.length; index += 1) {
    const [fromLon, fromLat] = line[index - 1]!;
    const [toLon, toLat] = line[index]!;
    const segment = wgs84.InverseLine(fromLat, fromLon, toLat, toLon);
    const end = length + segment.s13;
    if (!Number.isFinite(end) || end > (maxHeightSamples - 1) * spacingM) {
      return [];
    }
    while (target < end) {
      const location = segment.Position(target - length);
      positions.push({ distance: target, lon: location.lon2!, lat: location.lat2! });
      target += spacingM;
    }
    length = end;
  }
  if (length > 0) {
    const [lon, lat] = line.at(-1)!;
    positions.push({ distance: length, lon, lat });
  }
  return positions;
}

function summarize(profile: HeightSample[]) {
  const smoothed = profile.map((sample, index) => {
    const before = profile[index - 1]?.elevation_m;
    const after = profile[index + 1]?.elevation_m;
    if (before == null || after == null || sample.elevation_m === null) {
      return sample;
    }
    const ordered = [before, sample.elevation_m, after].sort((a, b) => a - b);
    return { ...sample, elevation_m: ordered[1]! };
  });
  let minimum = Infinity;
  let maximum = -Infinity;
  let covered = 0;
  let ascent = 0;
  let descent = 0;
  for (let index = 0; index < smoothed.length; index += 1) {
    const { elevation_m: elevation, distance_m: distance } = smoothed[index]!;
    if (elevation === null) {
      continue;
    }
    minimum = Math.min(minimum, elevation);
    maximum = Math.max(maximum, elevation);
    const previous = smoothed[index - 1];
    if (!previous || previous.elevation_m === null) {
      continue;
    }
    covered += distance - previous.distance_m;
    const change = elevation - previous.elevation_m;
    ascent += Math.max(change, 0);
    descent += Math.max(-change, 0);
  }
  const complete = smoothed.length > 0 && smoothed.every(sample => sample.elevation_m !== null);
  return {
    ascent_m: complete ? ascent : null,
    descent_m: complete ? descent : null,
    min_elevation_m: Number.isFinite(minimum) ? minimum : null,
    max_elevation_m: Number.isFinite(maximum) ? maximum : null,
    profile: smoothed,
    covered_distance_m: covered,
  };
}

export class CopernicusDem {
  private manifest?: Promise<Manifest>;
  private readonly tiles = new Map<string, Promise<DemTile | null>>();

  constructor(private readonly manifestPath?: string) {}

  async elevation(line: GeoLine): Promise<Elevation> {
    if (!this.manifestPath) {
      return { ...missingElevation, profile: [] };
    }
    this.manifest ??= readManifest(this.manifestPath).catch((error) => {
      this.manifest = undefined;
      throw error;
    });
    const manifest = await this.manifest;
    const samples = samplePositions(line);
    const profile: HeightSample[] = [];
    for (let start = 0; start < samples.length; start += 16) {
      const chunk = samples.slice(start, start + 16);
      const heights = await Promise.all(chunk.map(async position => ({
        distance_m: position.distance,
        elevation_m: await this.heightAt(position, manifest),
      })));
      profile.push(...heights);
    }
    return {
      ...summarize(profile),
      source,
      version: manifest.version,
      vertical_datum: verticalDatum,
      method,
    };
  }

  private async loadTile(lon: number, lat: number, manifest: Manifest): Promise<DemTile | null> {
    if (Math.abs(lat) > 90) {
      return null;
    }
    const id = tileId(lon, lat);
    const entry = manifest.tiles[id];
    if (!entry) {
      return null;
    }
    return remember(this.tiles, id, 4, async () => {
      try {
        const path = join(dirname(this.manifestPath!), entry.file);
        if ((await stat(path)).size > maxTileBytes) {
          return null;
        }
        const bytes = await readFile(path);
        if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
          return null;
        }
        const tiff = await fromArrayBuffer(Uint8Array.from(bytes).buffer);
        return new DemTile(await tiff.getImage());
      }
      catch {
        return null;
      }
    });
  }

  private async heightAt({ lon, lat }: LonLat, manifest: Manifest): Promise<number | null> {
    const tile = await this.loadTile(lon, lat, manifest);
    if (!tile) {
      return null;
    }
    const y = gridIndex((lat - tile.north) / tile.stepLat);
    const upper = Math.floor(y);
    const upperHeight = this.rowHeight(tile, lon, upper, manifest);
    if (upper === y) {
      return upperHeight;
    }
    const [a, b] = await Promise.all([upperHeight, this.rowHeight(tile, lon, upper + 1, manifest)]);
    return interpolate(a, b, y - upper);
  }

  private async rowHeight(base: DemTile, lon: number, row: number, manifest: Manifest): Promise<number | null> {
    const rowLat = base.north + row * base.stepLat;
    const latitudeInsideRowTile = rowLat + base.stepLat / 2;
    const tile = row < 0 || row >= base.height ? await this.loadTile(lon, latitudeInsideRowTile, manifest) : base;
    if (!tile) {
      return null;
    }
    const y = gridIndex((rowLat - tile.north) / tile.stepLat);
    if (!Number.isInteger(y)) {
      return null;
    }
    const x = gridIndex(longitude(lon - tile.west) / tile.stepLon);
    const left = Math.floor(x);
    const leftHeight = this.rowPixel(tile, left, y, rowLat, latitudeInsideRowTile, manifest);
    if (left === x) {
      return leftHeight;
    }
    const [a, b] = await Promise.all([leftHeight, this.rowPixel(tile, left + 1, y, rowLat, latitudeInsideRowTile, manifest)]);
    return interpolate(a, b, x - left);
  }

  private async rowPixel(tile: DemTile, x: number, y: number, rowLat: number, rowTileLat: number, manifest: Manifest) {
    if (x >= 0 && x < tile.width) {
      return tile.pixel(x, y);
    }
    const meridian = tile.west + x * tile.stepLon;
    const neighbor = await this.loadTile(meridian + tile.stepLon / 4, rowTileLat, manifest);
    if (!neighbor) {
      return null;
    }
    const nx = gridIndex(longitude(meridian - neighbor.west) / neighbor.stepLon);
    const ny = gridIndex((rowLat - neighbor.north) / neighbor.stepLat);
    return Number.isInteger(nx) && Number.isInteger(ny) ? neighbor.pixel(nx, ny) : null;
  }
}
