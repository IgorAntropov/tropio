import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { PublicTrip } from '@fsd/shared/api'
import type { MapCoordinate, MapFocus, MapPoint, MapSelection, MapTrack } from '@fsd/shared/map'

type Day = PublicTrip['days'][number]

export function routeScheme(day: Day) {
  const points: (MapPoint & { stop: 'start' | 'stop' | 'finish' })[] = []
  const tracks: (MapTrack & { name?: string; distance?: number })[] = []
  day.lines.forEach((line, index) => {
    const leg = day.legs?.[index]
    const coordinates = line.coordinates as MapCoordinate[]
    const first = coordinates[0]
    const last = coordinates.at(-1)
    if (!first || !last) return
    if (!index) points.push({
      id: day.position + ':point:0', stop: 'start', label: leg?.start_name ?? undefined,
      position: { lon: first[0], lat: first[1] },
    })
    tracks.push({
      id: day.position + ':track:' + index, name: leg?.name ?? undefined, coordinates,
      transportMode: leg?.transport_mode, distance: leg?.distance_m,
    })
    points.push({
      id: day.position + ':point:' + (index + 1), stop: index === day.lines.length - 1 ? 'finish' : 'stop',
      label: leg?.end_name ?? undefined, position: { lon: last[0], lat: last[1] },
    })
  })
  return { points, tracks }
}

export function useTripRoute(trip: Readonly<Ref<PublicTrip | null | undefined>>) {
  const day = ref(0)
  const segment = ref('')
  const visible = computed(() => trip.value?.days.filter(item => !day.value || item.position === day.value).map(routeScheme) ?? [])
  const points = computed(() => visible.value.flatMap(route => route.points))
  const tracks = computed(() => visible.value.flatMap(route => route.tracks))
  const pois = computed(() => trip.value?.pois.map(poi => ({ id: poi.poi_id, label: poi.name, position: poi.position })) ?? [])
  const selection = computed<MapSelection | null>(() => {
    if (tracks.value.some(track => track.id === segment.value)) return { kind: 'track', id: segment.value }
    if (points.value.some(point => point.id === segment.value)) return { kind: 'point', id: segment.value }
    if (pois.value.some(poi => poi.id === segment.value)) return { kind: 'poi', id: segment.value }
    return null
  })
  const focus = computed<MapFocus | null>(() => selection.value)
  function select(target: MapSelection) {
    if (target.kind !== 'poi') day.value = Number(target.id.split(':', 1)[0])
    segment.value = target.id
  }
  watch(() => trip.value?.publication_id, () => {
    day.value = 0
    segment.value = ''
  })
  return { day, segment, points, tracks, pois, selection, focus, select }
}
