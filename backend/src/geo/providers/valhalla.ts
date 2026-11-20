import { BffProblem } from '../../http/bff-problem.js'
import { distanceBetween, lineDistance, validCoordinate } from './geometry.js'
import type { GeoLine, LonLat, TransportMode } from './geometry.js'

export type Coverage = [west: number, south: number, east: number, north: number]
type BuildMode = 'automatic' | 'straight'
type Reason = 'no_edge' | 'disconnected' | 'outside_coverage'
type Endpoint = { requested: LonLat, snapped: LonLat | null, distance_m: number | null }

export type PreviewRequest = { from: LonLat, to: LonLat, transport_mode: TransportMode, build_mode: BuildMode }
type Alternative = {
  build_mode: BuildMode
  transport_mode: TransportMode
  geometry: GeoLine
  distance_m: number
  duration_s: number | null
  connection?: 'snapped_finish'
  warning?: 'unverified_passability'
}
export type Preview = {
  status: 'available' | 'unavailable'
  reason?: Reason
  from: Endpoint
  to: Endpoint
  geometry: GeoLine | null
  distance_m: number | null
  duration_s: number | null
  provider: string | null
  graph_version: string | null
  alternatives: Alternative[]
}

export type ValhallaOptions = {
  valhallaUrl?: string
  graphVersion?: string
  coverage?: Coverage[]
  snapLimitM?: number
  fetcher?: typeof fetch
  timeoutMs?: number
}

const costing = { car: 'auto', bicycle: 'bicycle', foot: 'pedestrian' } as const
const maxResponseBytes = 2_097_152

function unsetEndpoint(requested: LonLat): Endpoint {
  return { requested, snapped: null, distance_m: null }
}

function snappedEndpoint(requested: LonLat, [lon, lat]: GeoLine[number]): Endpoint {
  const snapped = { lon, lat }
  return { requested, snapped, distance_m: distanceBetween(requested, snapped) }
}

function insideCoverage({ lon, lat }: LonLat, [west, south, east, north]: Coverage): boolean {
  const longitudeInRange = west <= east ? lon >= west && lon <= east : lon >= west || lon <= east
  return longitudeInRange && lat >= south && lat <= north
}

function configuredCoverage(): Coverage[] {
  const raw = process.env.TROPIO_VALHALLA_COVERAGE
  if (!raw) return []
  const coverage: unknown = JSON.parse(raw)
  if (!Array.isArray(coverage) || coverage.some((bounds: unknown) => !validBounds(bounds))) {
    throw new BffProblem('DEPENDENCY_UNAVAILABLE')
  }
  return coverage as Coverage[]
}

function validBounds(bounds: unknown): bounds is Coverage {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every((value: unknown) => typeof value === 'number')) {
    return false
  }
  const [west, south, east, north] = bounds as Coverage
  return south <= north && validCoordinate({ lon: west, lat: south }) && validCoordinate({ lon: east, lat: north })
}

function decodePolyline(shape: string): GeoLine {
  if (typeof shape !== 'string') throw new Error('Missing Valhalla shape')
  let index = 0
  function readDelta(): number {
    let value = 0
    for (let power = 1; power <= 32 ** 5; power *= 32) {
      const part = shape.charCodeAt(index++) - 63
      if (!(part >= 0 && part <= 63)) break
      value += (part % 32) * power
      if (part < 32) return value % 2 ? -(value + 1) / 2 : value / 2
    }
    throw new Error('Invalid Valhalla shape')
  }

  const line: GeoLine = []
  let latitude = 0
  let longitude = 0
  while (index < shape.length) {
    latitude += readDelta()
    longitude += readDelta()
    const coordinate = { lon: longitude / 1e6, lat: latitude / 1e6 }
    if (!validCoordinate(coordinate)) throw new Error('Invalid Valhalla coordinate')
    line.push([coordinate.lon, coordinate.lat])
  }
  if (line.length < 2) throw new Error('Insufficient Valhalla shape')
  return line
}

async function responseData(response: Response): Promise<ValhallaResponse> {
  if (!response.body) throw new Error('Missing Valhalla response')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.length
      if (bytes > maxResponseBytes) throw new Error('Oversized Valhalla response')
      text += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as ValhallaResponse
  } finally {
    await reader.cancel()
  }
}

type ValhallaResponse = {
  error_code?: number
  trip?: {
    status: number
    summary?: { time: number, has_ferry?: boolean }
    legs?: { shape: string, summary?: { has_ferry?: boolean } }[]
  }
}

export class Valhalla {
  private readonly fetcher: typeof fetch
  private readonly timeoutMs: number

  constructor(private readonly options: ValhallaOptions) {
    this.fetcher = options.fetcher ?? fetch
    this.timeoutMs = options.timeoutMs ?? 5000
  }

  async preview(request: PreviewRequest): Promise<Preview> {
    const { from, to, build_mode: buildMode, transport_mode: transportMode } = request
    if (!validCoordinate(from) || !validCoordinate(to) || !Object.hasOwn(costing, transportMode) ||
      (buildMode !== 'straight' && buildMode !== 'automatic')) {
      throw new BffProblem('INVALID_REQUEST')
    }

    const geometry: GeoLine = [[from.lon, from.lat], [to.lon, to.lat]]
    const straight = {
      from: unsetEndpoint(from),
      to: unsetEndpoint(to),
      geometry,
      distance_m: distanceBetween(from, to),
      duration_s: null,
      provider: null,
      graph_version: null,
      alternatives: [],
    }
    if (buildMode === 'straight') return { status: 'available', ...straight }

    try {
      const graphVersion = this.options.graphVersion ?? process.env.TROPIO_VALHALLA_GRAPH_VERSION
      const url = this.options.valhallaUrl ?? process.env.TROPIO_VALHALLA_URL
      if (!url || !graphVersion?.trim()) throw new Error('Valhalla graph is unconfigured')
      const coverage = this.options.coverage ?? configuredCoverage()
      const snapLimit = this.options.snapLimitM ?? Number(process.env.TROPIO_VALHALLA_SNAP_LIMIT_M || 50)
      if (coverage.some(bounds => !validBounds(bounds)) || !Number.isFinite(snapLimit) || snapLimit <= 0 || snapLimit > 50) {
        throw new Error('Invalid Valhalla configuration')
      }

      const fallback: Alternative[] = [{
        build_mode: 'straight',
        transport_mode: transportMode,
        geometry,
        distance_m: straight.distance_m,
        duration_s: null,
        warning: 'unverified_passability',
      }]
      const unavailable: Preview = {
        ...straight,
        status: 'unavailable',
        geometry: null,
        distance_m: null,
        provider: 'valhalla',
        graph_version: graphVersion,
        alternatives: fallback,
      }
      if (coverage.length && ![from, to].every(point => coverage.some(bounds => insideCoverage(point, bounds)))) {
        return { ...unavailable, reason: 'outside_coverage' }
      }

      const routeUrl = new URL('route', `${url.replace(/\/+$/, '')}/`)
      const route = await this.route(request, routeUrl, snapLimit, unavailable)
      if (route.status === 'available') {
        const snapped = route.to.snapped
        if (snapped && route.to.distance_m !== null && route.to.distance_m >= 1) {
          route.alternatives = await this.finishAlternatives(request, snapped, routeUrl, unavailable)
        }
        return route
      }
      if (transportMode === 'foot') return route

      const foot = await this.route({ ...request, transport_mode: 'foot' }, routeUrl, snapLimit, unavailable).catch(() => null)
      if (foot?.status === 'available' && foot.geometry !== null && foot.distance_m !== null) {
        route.alternatives = [...fallback, {
          build_mode: 'automatic',
          transport_mode: 'foot',
          geometry: foot.geometry,
          distance_m: foot.distance_m,
          duration_s: foot.duration_s,
        }]
      }
      return route
    } catch {
      throw new BffProblem('DEPENDENCY_UNAVAILABLE')
    }
  }

  private async finishAlternatives(request: PreviewRequest, from: LonLat, url: URL, unavailable: Preview) {
    const { to, transport_mode } = request
    const first: GeoLine[number] = [from.lon, from.lat]
    const last: GeoLine[number] = [to.lon, to.lat]
    const alternatives: Alternative[] = [{
      build_mode: 'straight', transport_mode, connection: 'snapped_finish',
      geometry: [first, last], distance_m: distanceBetween(from, to), duration_s: null,
      warning: 'unverified_passability',
    }]
    if (transport_mode === 'foot') return alternatives

    const foot = await this.route({ ...request, from, transport_mode: 'foot' }, url, 1, unavailable).catch(() => null)
    if (foot?.status === 'available' && foot.geometry) {
      const geometry: GeoLine = [first, ...foot.geometry.slice(1, -1), last]
      alternatives.push({
        build_mode: 'automatic', transport_mode: 'foot', connection: 'snapped_finish',
        geometry, distance_m: lineDistance(geometry), duration_s: foot.duration_s,
      })
    }
    return alternatives
  }

  private async route(request: PreviewRequest, url: URL, snapLimit: number, unavailable: Preview): Promise<Preview> {
    const profile = costing[request.transport_mode]
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        locations: [request.from, request.to].map(point => ({
          ...point,
          radius: snapLimit,
          search_cutoff: snapLimit,
          search_filter: { exclude_ferry: true },
        })),
        costing: profile,
        costing_options: { [profile]: { use_ferry: 0, exclude_ferries: true } },
        shape_format: 'polyline6',
      }),
    })
    const data = await responseData(response)
    if (response.status >= 400 && response.status < 500) {
      if (data.error_code === 171) return { ...unavailable, reason: 'no_edge' }
      if (data.error_code === 170 || data.error_code === 441 || data.error_code === 442) {
        return { ...unavailable, reason: 'disconnected' }
      }
    }
    const { trip } = data
    if (!response.ok || !trip || trip.status !== 0 || !Array.isArray(trip.legs) || trip.legs.length !== 1 ||
      !trip.summary || !Number.isFinite(trip.summary.time) || trip.summary.time < 0) {
      throw new Error('Invalid Valhalla route')
    }
    const [leg] = trip.legs
    if (!leg) throw new Error('Missing Valhalla leg')
    const geometry = decodePolyline(leg.shape)
    const from = snappedEndpoint(request.from, geometry[0]!)
    const to = snappedEndpoint(request.to, geometry.at(-1)!)
    const result = { ...unavailable, from, to }
    if (Math.max(from.distance_m!, to.distance_m!) > snapLimit) return { ...result, reason: 'no_edge' }
    if (trip.summary.has_ferry || leg.summary?.has_ferry) return { ...result, reason: 'disconnected' }
    return {
      ...result,
      status: 'available',
      geometry,
      distance_m: lineDistance(geometry),
      duration_s: trip.summary.time,
      alternatives: [],
    }
  }
}
