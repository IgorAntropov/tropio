import type { StyleSpecification } from 'maplibre-gl'

export const tomskCenter = { lon: 84.956, lat: 56.476 }
export const tomskZoom = 13.15

export function pilotBasemap(baseURL: string): StyleSpecification {
  const path = new URL('route-map/tomsk.geojson', new URL(baseURL, window.location.origin))
  return {
    version: 8,
    name: 'Томск',
    sources: {
      'tropio-pilot': {
        type: 'geojson',
        data: path.href,
        attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
      },
    },
    layers: [
      { id: 'paper', type: 'background', paint: { 'background-color': '#e9ece0' } },
      {
        id: 'districts', type: 'fill', source: 'tropio-pilot',
        filter: ['==', ['get', 'kind'], 'block'],
        paint: { 'fill-color': '#f2eee1', 'fill-opacity': 0.7 },
      },
      {
        id: 'trees', type: 'fill', source: 'tropio-pilot',
        filter: ['==', ['get', 'kind'], 'green'],
        paint: { 'fill-color': '#b9d2b9', 'fill-opacity': 0.76 },
      },
      {
        id: 'water', type: 'fill', source: 'tropio-pilot',
        filter: ['==', ['get', 'kind'], 'water'],
        paint: { 'fill-color': '#a3ccd0', 'fill-outline-color': '#8fbdbf' },
      },
      {
        id: 'streams', type: 'line', source: 'tropio-pilot',
        filter: ['==', ['get', 'kind'], 'stream'],
        paint: { 'line-color': '#93bdc1', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.9, 16, 2.2] },
      },
      {
        id: 'local-streets', type: 'line', source: 'tropio-pilot', minzoom: 12,
        filter: ['==', ['get', 'kind'], 'street'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fcfaf4', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.55, 16, 3.4] },
      },
      {
        id: 'main-street-casing', type: 'line', source: 'tropio-pilot',
        filter: ['==', ['get', 'kind'], 'road'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#c3b49e', 'line-opacity': 0.88, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 6.4] },
      },
      {
        id: 'main-streets', type: 'line', source: 'tropio-pilot',
        filter: ['==', ['get', 'kind'], 'road'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fff8e3', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 16, 4.8] },
      },
      {
        id: 'map-places', type: 'symbol', source: 'tropio-pilot', minzoom: 10,
        filter: ['==', ['get', 'kind'], 'label'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Inter Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 15, 14],
          'symbol-sort-key': ['get', 'rank'],
          'text-padding': 5,
        },
        paint: { 'text-color': '#4f6154', 'text-halo-color': '#f4f7ea', 'text-halo-width': 1.4 },
      },
    ],
  }
}
