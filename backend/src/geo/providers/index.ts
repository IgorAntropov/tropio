import { CopernicusDem } from './copernicus-dem.js'
import { Valhalla } from './valhalla.js'
import type { GeoLine } from './geometry.js'
import type { Preview, PreviewRequest, ValhallaOptions } from './valhalla.js'

export type { GeoLine, LonLat, TransportMode } from './geometry.js'
export type { Elevation } from './copernicus-dem.js'
export type { Preview, PreviewRequest } from './valhalla.js'

export type GeoProvidersOptions = ValhallaOptions & { demManifestPath?: string }

export class GeoProviders {
  private readonly valhalla: Valhalla
  private readonly dem: CopernicusDem

  constructor(options: GeoProvidersOptions = {}) {
    this.valhalla = new Valhalla(options)
    this.dem = new CopernicusDem(options.demManifestPath ?? process.env.TROPIO_DEM_MANIFEST)
  }

  preview(request: PreviewRequest): Promise<Preview> {
    return this.valhalla.preview(request)
  }

  elevation(line: GeoLine) {
    return this.dem.elevation(line)
  }
}
