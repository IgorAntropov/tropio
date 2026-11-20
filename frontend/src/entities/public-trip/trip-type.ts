import type { PublicTripSummary } from '@fsd/shared/api';
import { transportIcons } from '@fsd/shared/ui/route-scheme';
import type { MaterialSymbol } from '@fsd/shared/ui/material-symbol';

export const tripTypeIcons = {
  foot: transportIcons.foot,
  bicycle: transportIcons.bicycle,
  car: transportIcons.car,
  combined: 'alt_route',
} as const satisfies Record<NonNullable<PublicTripSummary['trip_type']>, InstanceType<typeof MaterialSymbol>['$props']['name']>;
