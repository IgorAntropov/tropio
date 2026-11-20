import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from 'vue';
import {
  editorApi,
  EditorResponseError,
} from '@fsd/shared/api';
import type {
  DraftDay,
  ReadableRouteDraft,
  TravelDraft,
  TripDraftSummary,
} from '@fsd/shared/api';

type Preview = { kind: 'ready'; route: ReadableRouteDraft } | { kind: 'unbound' | 'empty' | 'restricted' };

type JourneyView = {
  trip: TravelDraft;
  day: DraftDay | null;
  preview: Preview;
};

const pageSize = 12;

function firstDayOf(trip: TravelDraft) {
  return trip.days.find(day => day.route_id) ?? trip.days[0] ?? null;
}

function isStatus(error: unknown, status: number) {
  return error instanceof EditorResponseError && error.status === status;
}

async function readPreview(day: DraftDay | null, signal: AbortSignal): Promise<Preview> {
  if (!day?.route_id) {
    return { kind: 'unbound' };
  }

  try {
    const route = await editorApi.getRoute(day.route_id, signal);
    if (route.availability !== 'available') {
      return { kind: 'restricted' };
    }
    return route.points.length || route.tracks.length ? { kind: 'ready', route } : { kind: 'empty' };
  }
  catch (error) {
    if (isStatus(error, 404)) {
      return { kind: 'restricted' };
    }
    throw error;
  }
}

async function findJourney(items: TripDraftSummary[], signal: AbortSignal): Promise<JourneyView | null> {
  let fallback: JourneyView | null = null;

  for (const item of items) {
    let trip: TravelDraft;

    try {
      trip = await editorApi.getTrip(item.trip_id, signal);
    }
    catch (error) {
      if (isStatus(error, 404)) {
        continue;
      }
      throw error;
    }

    const boundDays = trip.days.filter(day => day.route_id);
    if (!boundDays.length) {
      fallback ??= { trip, day: firstDayOf(trip), preview: { kind: 'unbound' } };
      continue;
    }

    for (const day of boundDays) {
      const preview = await readPreview(day, signal);
      const choice = { trip, day, preview };
      if (preview.kind === 'ready') {
        return choice;
      }
      fallback ??= choice;
    }
  }

  return fallback;
}

export function useWorkspaceMap() {
  const trips = shallowRef<TripDraftSummary[]>([]);
  const trip = shallowRef<TravelDraft | null>(null);
  const day = shallowRef<DraftDay | null>(null);
  const preview = shallowRef<Preview | null>(null);
  const selectedTripId = ref('');
  const nextCursor = ref<string | null>(null);
  const listLoading = ref(true);
  const previewLoading = ref(false);
  const listError = ref(false);
  const previewError = ref(false);
  const signedOut = ref(false);
  let listRequest: AbortController | undefined;
  let previewRequest: AbortController | undefined;

  function endSession() {
    listRequest?.abort();
    previewRequest?.abort();
    signedOut.value = true;
    listLoading.value = false;
    previewLoading.value = false;
    selectedTripId.value = '';
    nextCursor.value = null;
    trips.value = [];
    trip.value = null;
    day.value = null;
    preview.value = null;
  }

  async function loadPreview(read: (signal: AbortSignal) => Promise<JourneyView | null>) {
    previewRequest?.abort();
    const request = new AbortController();
    previewRequest = request;
    previewLoading.value = true;
    previewError.value = false;
    preview.value = null;

    try {
      const result = await read(request.signal);
      if (request.signal.aborted) {
        return;
      }

      if (result) {
        trip.value = result.trip;
        day.value = result.day;
        selectedTripId.value = result.trip.trip_id;
        preview.value = result.preview;
      }
      else {
        previewError.value = true;
      }
    }
    catch (error) {
      if (request.signal.aborted) {
        return;
      }
      if (isStatus(error, 401)) {
        endSession();
      }
      else {
        previewError.value = true;
      }
    }
    finally {
      if (previewRequest === request) {
        previewLoading.value = false;
      }
    }
  }

  async function loadTrips(append = false) {
    listRequest?.abort();
    const request = new AbortController();
    listRequest = request;
    listLoading.value = true;
    listError.value = false;

    try {
      const cursor = append ? nextCursor.value ?? undefined : undefined;
      const result = await editorApi.listTrips({ cursor, limit: pageSize }, request.signal);
      if (request.signal.aborted) {
        return;
      }

      const existing = append ? trips.value : [];
      const knownIds = new Set(existing.map(item => item.trip_id));
      trips.value = [...existing, ...result.items.filter(item => !knownIds.has(item.trip_id))];
      nextCursor.value = result.next_cursor;

      if (result.items.length && !previewLoading.value && (!append || !selectedTripId.value)) {
        void loadPreview(signal => findJourney(result.items, signal));
      }
    }
    catch (error) {
      if (request.signal.aborted) {
        return;
      }
      if (isStatus(error, 401)) {
        endSession();
      }
      else {
        listError.value = true;
      }
    }
    finally {
      if (listRequest === request) {
        listLoading.value = false;
      }
    }
  }

  function retryTrips() {
    void loadTrips(nextCursor.value !== null);
  }

  function selectTrip(id?: string) {
    if (!id || (id === selectedTripId.value && trip.value)) {
      return;
    }

    selectedTripId.value = id;
    trip.value = null;
    day.value = null;
    void loadPreview(async (signal) => {
      const selected = await editorApi.getTrip(id, signal);
      const first = firstDayOf(selected);
      return { trip: selected, day: first, preview: await readPreview(first, signal) };
    });
  }

  function selectDay(id?: string) {
    const currentTrip = trip.value;
    const selected = currentTrip?.days.find(item => item.day_id === id);
    if (!currentTrip || !selected || (selected === day.value && preview.value)) {
      return;
    }

    day.value = selected;
    void loadPreview(async signal => ({ trip: currentTrip, day: selected, preview: await readPreview(selected, signal) }));
  }

  function retryPreview() {
    if (day.value) {
      selectDay(day.value.day_id);
    }
    else if (selectedTripId.value) {
      selectTrip(selectedTripId.value);
    }
    else {
      void loadPreview(signal => findJourney(trips.value, signal));
    }
  }

  onMounted(() => void loadTrips());
  onBeforeUnmount(() => {
    listRequest?.abort();
    previewRequest?.abort();
  });

  return {
    trips,
    trip,
    day,
    preview,
    selectedTripId,
    nextCursor,
    listLoading,
    previewLoading,
    listError,
    previewError,
    signedOut,
    loadTrips,
    retryTrips,
    selectTrip,
    selectDay,
    retryPreview,
  };
}
