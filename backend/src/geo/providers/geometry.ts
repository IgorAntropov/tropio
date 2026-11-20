import geodesic from 'geographiclib-geodesic'

export type LonLat = { lon: number, lat: number }
export type GeoLine = [number, number][]
export type TransportMode = 'car' | 'bicycle' | 'foot'

export const wgs84 = geodesic.Geodesic.WGS84

export function validCoordinate({ lon, lat }: LonLat): boolean {
  return Number.isFinite(lon) && Math.abs(lon) <= 180 && Number.isFinite(lat) && Math.abs(lat) <= 90
}

export function distanceBetween(from: LonLat, to: LonLat): number {
  return wgs84.Inverse(from.lat, from.lon, to.lat, to.lon).s12!
}

export function lineDistance(line: GeoLine): number {
  let distance = 0
  for (let index = 1; index < line.length; index += 1) {
    const [fromLon, fromLat] = line[index - 1]!
    const [toLon, toLat] = line[index]!
    distance += distanceBetween({ lon: fromLon, lat: fromLat }, { lon: toLon, lat: toLat })
  }
  return distance
}
