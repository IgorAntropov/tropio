import { createHash } from 'node:crypto';
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeArrayBuffer } from 'geotiff';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { GeoProviders } from '../src/geo/providers/index.js';
import type { GeoLine } from '../src/geo/providers/index.js';

const from = { lon: 84.95, lat: 56.48 };
const to = { lon: 84.97, lat: 56.46 };
const request = {
  from,
  to,
  transport_mode: 'car',
  build_mode: 'automatic',
} as const;

function polyline(line: GeoLine): string {
  let lastLat = 0;
  let lastLon = 0;
  function encode(value: number): string {
    let unsigned = value < 0 ? -value * 2 - 1 : value * 2;
    let result = '';
    while (unsigned >= 32) {
      result += String.fromCharCode(63 + (unsigned % 32) + 32);
      unsigned = Math.floor(unsigned / 32);
    }
    return result + String.fromCharCode(63 + unsigned);
  }

  return line.map(([lon, lat]) => {
    const nextLat = Math.round(lat * 1e6);
    const nextLon = Math.round(lon * 1e6);
    const result = encode(nextLat - lastLat) + encode(nextLon - lastLon);
    lastLat = nextLat;
    lastLon = nextLon;
    return result;
  }).join('');
}

function result(line: GeoLine, ferry = false) {
  return Response.json({
    trip: {
      status: 0,
      summary: { time: 170, has_ferry: ferry },
      legs: [{ shape: polyline(line), summary: { has_ferry: ferry } }],
    },
  });
}

function adapter(fetcher: typeof fetch) {
  return new GeoProviders({
    valhallaUrl: 'http://localhost:8002',
    graphVersion: 'test-osm',
    coverage: [[84.8, 56.4, 85.1, 56.55]],
    fetcher,
  });
}

describe('Valhalla preview', () => {
  it('uses actual polyline6 points to report a requested-to-network offset', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => result([[84.9501, 56.48], [84.97, 56.46]]));
    const preview = await adapter(fetcher).preview(request);

    expect(preview).toMatchObject({
      status: 'available',
      from: { requested: from, snapped: { lon: 84.9501, lat: 56.48 } },
      to: { requested: to, snapped: to, distance_m: 0 },
      geometry: [[84.9501, 56.48], [84.97, 56.46]],
      provider: 'valhalla',
      graph_version: 'test-osm',
      duration_s: 170,
    });
    expect(preview.from.distance_m).toBeGreaterThan(5);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('http://localhost:8002/route');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      costing: 'auto',
      locations: [{ radius: 50, search_cutoff: 50 }, { radius: 50, search_cutoff: 50 }],
      shape_format: 'polyline6',
    });
  });

  it.each([[171, 'no_edge'], [170, 'disconnected'], [442, 'disconnected']])(
    'maps upstream error %s to %s with an explicit straight alternative',
    async (errorCode, reason) => {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ error_code: errorCode }, { status: 400 }));
      const preview = await adapter(fetcher).preview(request);

      expect(preview).toMatchObject({
        status: 'unavailable',
        reason,
        geometry: null,
        from: { requested: from },
        to: { requested: to },
        alternatives: [{
          build_mode: 'straight',
          transport_mode: 'car',
          geometry: [[from.lon, from.lat], [to.lon, to.lat]],
          duration_s: null,
          warning: 'unverified_passability',
        }],
      });
    },
  );

  it('offers the pedestrian profile only when a complete independent route stays within both snap limits', async () => {
    const line: GeoLine = [[from.lon, from.lat], [to.lon, to.lat]];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
      const body = JSON.parse(String(init?.body)) as { costing: string };
      return body.costing === 'pedestrian'
        ? result(line)
        : Response.json({ error_code: 171 }, { status: 400 });
    });
    expect(await adapter(fetcher).preview(request)).toMatchObject({
      status: 'unavailable',
      alternatives: [
        { build_mode: 'straight', transport_mode: 'car' },
        {
          build_mode: 'automatic',
          transport_mode: 'foot',
          geometry: line,
          duration_s: 170,
        },
      ],
    });

    fetcher.mockResolvedValueOnce(Response.json({ error_code: 171 }, { status: 400 }));
    fetcher.mockResolvedValueOnce(result([[from.lon, from.lat], [to.lon + 0.001, to.lat]]));
    expect((await adapter(fetcher).preview(request)).alternatives).toHaveLength(1);
  });

  it('refuses provider geometry when the actual offset exceeds 50 m', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => result([[84.951, 56.48], [84.97, 56.46]]));
    const preview = await adapter(fetcher).preview(request);

    expect(preview).toMatchObject({ status: 'unavailable', reason: 'no_edge', geometry: null });
    expect(preview.from.distance_m).toBeGreaterThan(50);
  });

  it('excludes ferries and outside coverage, and distinguishes infrastructure errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => result([[84.95, 56.48], [84.97, 56.46]], true));

    expect(await adapter(fetcher).preview(request)).toMatchObject({ status: 'unavailable', geometry: null });
    fetcher.mockClear();
    expect(await adapter(fetcher).preview({ ...request, to: { lon: 86, lat: 56.46 } })).toMatchObject({
      status: 'unavailable',
      reason: 'outside_coverage',
    });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRejectedValue(new Error('connection unavailable'));
    await expect(adapter(fetcher).preview(request)).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });

  it('calculates a manual segment independently of Valhalla', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await adapter(fetcher).preview({ ...request, build_mode: 'straight', transport_mode: 'foot' })).toMatchObject({
      status: 'available',
      provider: null,
      graph_version: null,
      duration_s: null,
      from: { requested: from, snapped: null, distance_m: null },
      geometry: [[from.lon, from.lat], [to.lon, to.lat]],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports missing local DEM without inventing height statistics', async () => {
    expect(await new GeoProviders({ demManifestPath: '' }).elevation([[84.95, 56.48], [84.97, 56.46]])).toMatchObject({
      ascent_m: null,
      descent_m: null,
      min_elevation_m: null,
      max_elevation_m: null,
      source: null,
      version: null,
      profile: [],
    });
  });
});

const demDirectories: string[] = [];

async function fixtureManifest(tiles: { id: string; west: number; north: number; height: number; corruptHash?: boolean }[]) {
  const directory = await mkdtemp(join(tmpdir(), 'tropio-dem-test-'));
  demDirectories.push(directory);
  const entries = await Promise.all(tiles.map(async ({ id, west, north, height, corruptHash }) => {
    const data = Buffer.from(writeArrayBuffer(new Float32Array(16).fill(height), {
      width: 4,
      height: 4,
      BitsPerSample: [32],
      SampleFormat: [3],
      ModelPixelScale: [0.25, 0.25, 0],
      ModelTiepoint: [0, 0, 0, west, north, 0],
      GeographicTypeGeoKey: 4326,
      GTModelTypeGeoKey: 2,
      GTRasterTypeGeoKey: 2,
      GDAL_NODATA: '-9999',
    }));
    const file = `${id}.tif`;
    await writeFile(join(directory, file), data);
    const sha256 = corruptHash ? '0'.repeat(64) : createHash('sha256').update(data).digest('hex');
    return [id, { file, sha256 }];
  }));
  const manifest = join(directory, 'manifest.json');
  await writeFile(manifest, JSON.stringify({
    source: 'copernicus-dem-glo-30-public',
    version: 'fixture',
    vertical_datum: 'EGM2008',
    tiles: Object.fromEntries(entries),
  }));
  return manifest;
}

afterEach(async () => {
  await Promise.all(demDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('Copernicus DEM local profile', () => {
  const tomsk = {
    id: 'N56_00_E084_00',
    west: 84,
    north: 57,
    height: 50,
  };
  const east = {
    id: 'N56_00_E085_00',
    west: 85,
    north: 57,
    height: 90,
  };
  const south = {
    id: 'N55_00_E084_00',
    west: 84,
    north: 56,
    height: 25,
  };

  it('retains both endpoints of a short track and interpolates across a longitude seam', async () => {
    const demManifestPath = await fixtureManifest([tomsk, east]);
    const elevation = await new GeoProviders({ demManifestPath }).elevation([[84.9998, 56.75], [85.0001, 56.75]]);

    expect(elevation).toMatchObject({
      source: 'copernicus-dem-glo-30-public',
      version: 'fixture',
      vertical_datum: 'EGM2008',
      method: 'wgs84-30m-bilinear-median3-v1',
    });
    expect(elevation.profile).toHaveLength(2);
    expect(elevation.profile[0]?.elevation_m).toBeCloseTo(89.968, 3);
    expect(elevation.profile[1]?.elevation_m).toBe(90);
    expect(elevation.profile[1]?.distance_m).toBeCloseTo(18.36, 1);
    expect(elevation.covered_distance_m).toBe(elevation.profile[1]?.distance_m);
    expect(elevation.ascent_m).toBeCloseTo(0.032, 3);
    expect(elevation.descent_m).toBe(0);
  });

  it('interpolates across a latitude seam and samples cumulative distance around a turn', async () => {
    const demManifestPath = await fixtureManifest([tomsk, south]);
    const adapter = new GeoProviders({ demManifestPath });
    const line: GeoLine = [[84.5, 56.0005], [84.5, 55.9999], [84.5004, 55.9999]];
    const elevation = await adapter.elevation(line);

    expect(elevation.profile[0]?.elevation_m).toBeCloseTo(25.05, 3);
    expect(elevation.profile.at(-1)?.elevation_m).toBe(25);
    expect(elevation.profile.slice(0, -1).map(sample => sample.distance_m)).toEqual([0, 30, 60, 90]);
    expect(elevation.profile.at(-1)?.distance_m).toBeCloseTo(91.74, 0);
    expect(elevation.descent_m).toBeCloseTo(0.05, 3);
    expect(await adapter.elevation(line)).toEqual(elevation);
  });

  it.each([
    ['absent tile', []],
    ['NoData tile', [{ ...east, height: -9999 }]],
    ['checksum mismatch', [{ ...east, corruptHash: true }]],
  ] as const)('retains gaps for a %s and produces no total ascent or descent', async (_, otherTiles) => {
    const demManifestPath = await fixtureManifest([tomsk, ...otherTiles]);
    const elevation = await new GeoProviders({ demManifestPath }).elevation([[84.75, 56.75], [84.7505, 56.75]]);

    expect(elevation.profile.map(sample => sample.elevation_m)).toEqual([50, null, null]);
    expect(elevation).toMatchObject({
      ascent_m: null,
      descent_m: null,
      min_elevation_m: 50,
      max_elevation_m: 50,
      covered_distance_m: 0,
    });
  });
});
