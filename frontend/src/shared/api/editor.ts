import type {
  components,
  operations,
} from './openapi';

type Schemas = components['schemas'];
type Operation = keyof operations;
type Input<Name extends Operation> = NonNullable<operations[Name]['requestBody']> extends {
  content: { 'application/json': infer Body };
} ? Body : never;
type Output<Name extends Operation> = Extract<operations[Name]['responses'][keyof operations[Name]['responses']], {
  content: { 'application/json': unknown };
}>['content']['application/json'];

export type AccountTripQuery = NonNullable<operations['listAccountTrips']['parameters']['query']>;
export type AccountTripCollection = NonNullable<AccountTripQuery['collection']>;
export type AccountTripStatus = NonNullable<AccountTripQuery['status']>;
export type AccountTripPage = Schemas['AccountTripPage'];
export type AccountTripCard = Schemas['AccountTripCard'];
export type TripListQuery = NonNullable<operations['listMyTripDrafts']['parameters']['query']>;
export type PoiListQuery = operations['listPois']['parameters']['query'];
export type EditorRequest = { csrf: string; signal?: AbortSignal };
export type EditorCommand = EditorRequest & { key: string };

export type TravelDraft = Schemas['TripDraft'];
export type TripDraft = TravelDraft;
export type DraftDay = Schemas['DraftDay'];
export type TripDraftSummary = Schemas['TripDraftSummary'];
export type MyTripDraftList = Schemas['MyTripDraftList'];
export type CreateTripDraftRequest = Input<'createTripDraft'>;
export type EquipmentLibraryItem = Schemas['EquipmentLibraryItem'];
export type UpdateTripDraftRequest = Input<'updateTripDraft'>;
export type PublishCommand = Input<'publishTrip'>;
export type UnpublishCommand = Input<'unpublishTrip'>;
export type PublicationOperation = Schemas['PublicationOperation'];
export type PublicTrip = Schemas['PublicTrip'];
export type PublicTripSummary = Schemas['PublicTripSummary'];
export type PublicTripPage = Schemas['PublicTripPage'];
export type CatalogFilterOptions = Output<'getCatalogFilterOptions'>;
export type CatalogQuery = NonNullable<operations['listPublicTrips']['parameters']['query']>;
export type EnsureTripDayRouteRequest = Input<'ensureTripDayRoute'>;

export type RouteDraft = Schemas['RouteDraft'];
export type ReadableRouteDraft = Schemas['ReadableRouteDraft'];
export type ReplaceRouteDraft = Input<'replaceRouteDraft'>;
export type RestoreRouteDraft = Input<'restoreRouteDraft'>;
export type RouteTrackPreviewRequest = Input<'previewRouteTrack'>;
export type RouteTrackPreview = Output<'previewRouteTrack'>;
export type RoutePreviewAlternative = Schemas['RoutePreviewAlternative'];
export type RoutePoint = Schemas['RoutePoint'];
export type Track = Schemas['Track'];
export type RoutePointInput = Schemas['RoutePointInput'];
export type RouteTrackInput = Schemas['RouteTrackInput'];
export type GeoBuildMode = Schemas['GeoBuildMode'];
export type GeoTransportMode = Schemas['GeoTransportMode'];
export type LonLat = Schemas['LonLat'];
export type Position = LonLat;
export type SplitCommand = Input<'splitTrack'>;
export type SplitResult = Output<'splitTrack'>;

export type Poi = Schemas['Poi'];
export type PoiCategories = Output<'listPoiCategories'>;
export type PoiPage = Output<'listPois'>;
export type CreatePoiRequest = Input<'createPoi'>;

export class EditorResponseError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;
  readonly currentRouteRevisionId: string | undefined;
  readonly currentTripRevisionId: string | undefined;
  readonly currentPoiRevisionId: string | undefined;

  constructor(readonly status: number, problem: unknown, headerRequestId?: string) {
    const code = problemField(problem, 'code') ?? '';
    super(`${status} ${code}`);
    this.name = 'EditorResponseError';
    this.code = code;
    this.requestId = problemField(problem, 'request_id') ?? headerRequestId;
    this.currentRouteRevisionId = problemField(problem, 'current_route_revision_id');
    this.currentTripRevisionId = problemField(problem, 'current_trip_revision_id');
    this.currentPoiRevisionId = problemField(problem, 'current_poi_revision_id');
  }
}

function problemField(problem: unknown, field: keyof Schemas['Problem']): string | undefined {
  if (!problem || typeof problem !== 'object' || !Object.hasOwn(problem, field)) {
    return undefined;
  }
  const value = (problem as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

function queryPath(path: string, query: Record<string, string | number | readonly number[] | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  return params.size ? `${path}?${params.toString()}` : path;
}

async function call<T>(path: string, options: {
  method?: 'POST' | 'PUT' | 'PATCH';
  body?: object;
  csrf?: string;
  key?: string;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
} = {}): Promise<T> {
  const { body, csrf, key, method = 'GET', signal } = options;
  const headers = new Headers({ accept: 'application/json, application/problem+json' });
  if (body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  if (csrf !== undefined) {
    headers.set('x-csrf-token', csrf);
  }
  if (key !== undefined) {
    headers.set('idempotency-key', key);
  }

  const response = await fetch(`/api/v1${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    signal,
    cache: 'no-store',
    credentials: options.credentials ?? 'same-origin',
  });
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    signal?.throwIfAborted();
    throw new EditorResponseError(response.status, problem, response.headers.get('x-request-id') ?? undefined);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export const editorApi = {
  getTripRoster: (tripId: string, signal: AbortSignal) =>
    call<Output<'getTripRoster'>>(`/trips/${encodeURIComponent(tripId)}/roster`, { signal }),
  updateTripRoster: (tripId: string, entryId: string, body: Input<'updateTripRoster'>, options: EditorRequest) =>
    call<undefined>(`/trips/${encodeURIComponent(tripId)}/roster/${encodeURIComponent(entryId)}`, { ...options, method: 'PUT', body }),
  getCatalogParticipation: (ids: readonly string[], signal: AbortSignal) =>
    call<Output<'getCatalogParticipation'>>(queryPath('/catalog/participation', { trip_ids: ids.join(',') }), { signal }),
  requestTripParticipation: (tripId: string, mode: Schemas['TripAdmissionMode'], options: EditorRequest) =>
    call<Output<'requestTripParticipation'>>(`/trips/${encodeURIComponent(tripId)}/applications`, {
      ...options,
      method: 'POST',
      body: { admission_mode: mode },
    }),
  listAccountTrips: (query: AccountTripQuery, signal: AbortSignal) =>
    call<AccountTripPage>(queryPath('/me/trips', query), { signal }),
  getTripFavorite: (tripId: string, signal: AbortSignal) =>
    call<Output<'getTripFavorite'>>('/me/favorites/' + encodeURIComponent(tripId), { signal }),
  setTripFavorite: (tripId: string, saved: boolean, options: EditorRequest) =>
    call<Output<'setTripFavorite'>>('/me/favorites/' + encodeURIComponent(tripId), { ...options, method: 'PUT', body: { saved } }),
  listTrips: (query?: TripListQuery, signal?: AbortSignal) =>
    call<MyTripDraftList>(queryPath('/trips', query), { signal }),
  listEquipment: (signal?: AbortSignal) => call<Output<'listEquipmentLibrary'>>('/me/equipment', { signal }),
  createEquipment: (body: Input<'createPersonalEquipment'>, command: EditorCommand) =>
    call<EquipmentLibraryItem>('/me/equipment', { ...command, method: 'POST', body }),
  createTrip: (body: CreateTripDraftRequest, command: EditorCommand) =>
    call<TravelDraft>('/trips', { ...command, method: 'POST', body }),
  getTrip: (tripId: string, signal?: AbortSignal) =>
    call<TravelDraft>(`/trips/${encodeURIComponent(tripId)}/draft`, { signal }),
  getPublicTrip: (tripId: string, signal?: AbortSignal) =>
    call<PublicTrip>(`/catalog/trips/${encodeURIComponent(tripId)}`, { signal, credentials: 'omit' }),
  updateTrip: (tripId: string, body: UpdateTripDraftRequest, command: EditorCommand) =>
    call<TravelDraft>(`/trips/${encodeURIComponent(tripId)}`, { ...command, method: 'PATCH', body }),
  publishTrip: (tripId: string, body: PublishCommand, command: EditorCommand) =>
    call<PublicationOperation>(`/trips/${encodeURIComponent(tripId)}/publish`, { ...command, method: 'POST', body }),
  getPublicationOperation: (tripId: string, operationId: string, signal?: AbortSignal) =>
    call<PublicationOperation>(`/trips/${encodeURIComponent(tripId)}/publication-operations/${encodeURIComponent(operationId)}`, { signal }),
  unpublishTrip: (tripId: string, body: UnpublishCommand, command: EditorCommand) =>
    call<Output<'unpublishTrip'>>(`/trips/${encodeURIComponent(tripId)}/unpublish`, { ...command, method: 'POST', body }),
  ensureDayRoute: (dayId: string, body: EnsureTripDayRouteRequest, command: EditorCommand) =>
    call<TravelDraft>(`/days/${encodeURIComponent(dayId)}/route`, { ...command, method: 'PUT', body }),
  getRoute: (routeId: string, signal?: AbortSignal) =>
    call<RouteDraft>(`/routes/${encodeURIComponent(routeId)}`, { signal }),
  replaceRoute: (routeId: string, body: ReplaceRouteDraft, command: EditorCommand) =>
    call<ReadableRouteDraft>(`/routes/${encodeURIComponent(routeId)}`, { ...command, method: 'PUT', body }),
  preview: (body: RouteTrackPreviewRequest, options: EditorRequest) =>
    call<RouteTrackPreview>('/routing/calculate', { ...options, method: 'POST', body }),
  splitTrack: (trackId: string, body: SplitCommand, command: EditorCommand) =>
    call<SplitResult>(`/tracks/${encodeURIComponent(trackId)}/split`, { ...command, method: 'POST', body }),
  restoreRoute: (routeId: string, body: RestoreRouteDraft, command: EditorCommand) =>
    call<ReadableRouteDraft>(`/routes/${encodeURIComponent(routeId)}/restore`, { ...command, method: 'POST', body }),
  listPoiCategories: (signal?: AbortSignal) => call<PoiCategories>('/poi-categories', { signal }),
  listPois: (query: PoiListQuery, signal?: AbortSignal) => call<PoiPage>(queryPath('/pois', query), { signal }),
  getPoi: (poiId: string, signal?: AbortSignal) => call<Poi>(`/pois/${encodeURIComponent(poiId)}`, { signal }),
  createPoi: (body: CreatePoiRequest, command: EditorCommand) => call<Poi>('/pois', { ...command, method: 'POST', body }),
};
