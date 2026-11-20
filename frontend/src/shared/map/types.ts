export type MapPosition = { lon: number; lat: number }
export type MapCoordinate = [longitude: number, latitude: number]

export type MapPoint = {
  id: string
  position: MapPosition
  label?: string
  number?: number
}

export type MapPoi = MapPoint

export type MapTripFlight = {
  id: string
  bottomInset?: number
  publicationId?: string
  marker?: MapPoint
  ready: boolean
  animate: boolean
}

export type MapFlightPhase = 'waiting' | 'flying' | 'arrived'

export type MapTrack = {
  id: string
  coordinates: MapCoordinate[]
  transportMode?: 'car' | 'bicycle' | 'foot'
  dashed?: boolean
}

export type MapSelection = { kind: 'point' | 'track' | 'poi'; id: string }
export type MapFocus = MapSelection & { request?: number }
export type MapMode = 'view' | 'build' | 'split' | 'move' | 'poi'

export type MapHint = {
  from?: MapPosition
  requested: MapPosition
  snapped?: MapPosition
  coordinates?: MapCoordinate[]
}

export type MapScene = {
  points: readonly MapPoint[]
  tracks: readonly MapTrack[]
  pois: readonly MapPoi[]
  selection?: MapSelection | null
  mode: MapMode
  hint?: MapHint | null
  tripMarkers?: boolean
  clusterPoints?: boolean
  interactiveMarkers?: boolean
}

export interface MapRendererAdapter {
  setScene(scene: MapScene): void
  setStyle(styleUrl?: string): void
  approachTrip(flight: MapTripFlight, scene: MapScene): MapFlightPhase
  leaveTrip(): boolean
  focus(target: MapFocus): boolean
  fitRoute(): boolean
  center(position: MapPosition): void
  resize(): void
  destroy(): void
}
