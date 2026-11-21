import type {
  TravelDraft,
  UpdateTripDraftRequest,
} from '@fsd/shared/api';

export function useTripCreation() {
  return useState('trip-creation-open', () => false);
}

export function useCreatedTripDay() {
  return useState<string | null>('trip-created-day', () => null);
}

export function tripSettings(draft?: TravelDraft) {
  return {
    title: draft?.title ?? '',
    description: draft?.description ?? '',
    start_date: draft?.start_date ?? '',
    end_date: draft?.end_date ?? '',
    free_capacity: draft?.free_capacity?.toString() ?? '',
  };
}

export function tripSettingsBody(fields: ReturnType<typeof tripSettings>) {
  return {
    title: fields.title.trim(),
    description: fields.description.trim() || null,
    start_date: fields.start_date || null,
    end_date: fields.end_date || null,
    free_capacity: fields.free_capacity.trim() ? Number(fields.free_capacity) : null,
  };
}

export function tripDaySchedule(draft: TravelDraft | undefined, start: string, end: string) {
  if (!draft || !start || (start === draft.start_date && end === (draft.end_date ?? ''))) {
    return { shift: false, valid: true };
  }
  const dates = draft.days.flatMap(day => day.local_date ? [Date.parse(day.local_date)] : []);
  const first = Date.parse(start);
  const last = end ? Date.parse(end) : first;
  const offset = draft.start_date ? first - Date.parse(draft.start_date) : 0;
  return {
    shift: dates.length > 0 && offset !== 0,
    valid: dates.every(date => date + offset >= first && date + offset <= last),
  };
}

export function tripSettingsPatch(draft: TravelDraft, body: ReturnType<typeof tripSettingsBody>): UpdateTripDraftRequest {
  const previous = tripSettingsBody(tripSettings(draft));
  const keys = Object.keys(body) as (keyof typeof body)[];
  const changes = Object.fromEntries(keys.filter(key => body[key] !== previous[key]).map(key => [key, body[key]]));
  const { shift } = tripDaySchedule(draft, body.start_date ?? '', body.end_date ?? '');
  return { ...changes, ...(shift ? { shift_day_dates: true } : {}), trip_revision_id: draft.trip_revision_id };
}
