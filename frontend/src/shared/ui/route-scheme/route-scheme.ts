export const transportIcons = {
  car: 'directions_car',
  bicycle: 'pedal_bike',
  foot: 'directions_walk',
} as const;

export type SchemeSelection = { type: 'point' | 'track'; id: string };
export type SchemePoint = { id: string; label: string; position: { lon: number; lat: number } };
export type SchemeTrack = {
  id: string;
  label: string;
  transportMode?: keyof typeof transportIcons;
  distance?: number;
  detail?: string;
  warning?: boolean;
};

const distanceKilometers = new Intl.NumberFormat('ru', {
  style: 'unit',
  unit: 'kilometer',
  unitDisplay: 'short',
  maximumFractionDigits: 2,
});
const distanceMeters = new Intl.NumberFormat('ru', {
  style: 'unit',
  unit: 'meter',
  unitDisplay: 'short',
  maximumFractionDigits: 0,
});

export function coordinateLabel({ lat, lon }: SchemePoint['position']) {
  return `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;
}

export function distanceLabel(distance: number) {
  return distance >= 1000 ? distanceKilometers.format(distance / 1000) : distanceMeters.format(distance);
}
