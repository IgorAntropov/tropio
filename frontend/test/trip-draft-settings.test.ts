import {
  expect,
  it,
} from 'vitest';
import {
  tripDaySchedule,
  tripSettings,
  tripSettingsBody,
  tripSettingsPatch,
} from '../src/features/trip-draft-dialog/model';
import type { TravelDraft } from '../src/shared/api';

function draftWithDates(start: string | null, end: string | null, dates: (string | null)[]): TravelDraft {
  return {
    trip_id: crypto.randomUUID(),
    trip_revision_id: crypto.randomUUID(),
    title: 'Перевал',
    description: 'Описание',
    start_date: start,
    end_date: end,
    free_capacity: 4,
    visibility: 'private',
    admission_mode: 'request',
    difficulty: null,
    equipment: [],
    participation_rules: null,
    publication_id: null,
    timezone: null,
    days: dates.map((local_date, index) => ({
      day_id: crypto.randomUUID(),
      position: index + 1,
      local_date,
      description: null,
      notes: null,
      route_id: null,
    })),
  };
}

it('starts a new trip with one free place and allows clearing the capacity', () => {
  expect(tripSettingsBody({ ...tripSettings(), title: '  Перевал  ' })).toEqual({
    title: 'Перевал',
    description: null,
    start_date: null,
    end_date: null,
    free_capacity: 1,
    equipment: [],
  });
  expect(tripSettingsBody({ ...tripSettings(), free_capacity: '' }).free_capacity).toBeNull();
});

it.each([null, 1, 6])('preserves the saved capacity %s when editing other fields', (capacity) => {
  const draft = { ...draftWithDates(null, null, []), free_capacity: capacity };
  const fields = tripSettings(draft);
  expect(fields.free_capacity).toBe(capacity?.toString() ?? '');
  fields.title = 'Другая поездка';
  expect(tripSettingsPatch(draft, tripSettingsBody(fields))).toEqual({
    trip_revision_id: draft.trip_revision_id,
    title: fields.title,
  });
});

it('keeps an existing cover and ordered equipment when editing other fields', () => {
  const draft = draftWithDates(null, null, []);
  draft.cover_id = crypto.randomUUID();
  draft.equipment = [{ label: 'Фонарь', required: false }, { label: 'Рюкзак', required: true }];
  const fields = tripSettings(draft);
  expect(tripSettingsPatch(draft, tripSettingsBody(fields))).toEqual({ trip_revision_id: draft.trip_revision_id });
  fields.equipment[0]!.required = true;
  fields.equipment.pop();
  expect(draft.equipment).toHaveLength(2);
  expect(draft.equipment[0]?.required).toBe(false);
  expect(tripSettingsPatch(draft, tripSettingsBody(fields))).toEqual({
    trip_revision_id: draft.trip_revision_id,
    equipment: [{ label: 'Фонарь', required: true }],
  });
});

it('sends a replacement cover or an explicit reset and can clear all gear', () => {
  const draft = draftWithDates(null, null, []);
  draft.cover_id = crypto.randomUUID();
  draft.equipment = [{ label: 'Налобный фонарь', required: false }];
  const fields = tripSettings(draft);
  fields.cover = { content_type: 'image/webp', data_base64: 'aW1hZ2U=' };
  expect(tripSettingsPatch(draft, tripSettingsBody(fields))).toEqual({ cover: fields.cover, trip_revision_id: draft.trip_revision_id });
  fields.cover = null;
  fields.equipment = [];
  expect(tripSettingsPatch(draft, tripSettingsBody(fields))).toEqual({ cover: null, equipment: [], trip_revision_id: draft.trip_revision_id });
  draft.cover_id = null;
  expect(tripSettingsPatch(draft, tripSettingsBody(fields))).not.toHaveProperty('cover');
});

it('lets the owner edit basic fields on an older draft without resubmitting its dates', () => {
  const draft = draftWithDates('2027-01-03', null, ['2027-01-02']);
  const fields = { ...tripSettings(draft), description: '', free_capacity: '8' };
  expect(tripDaySchedule(draft, fields.start_date, fields.end_date)).toEqual({ shift: false, valid: true });
  expect(tripSettingsPatch(draft, tripSettingsBody(fields))).toEqual({
    trip_revision_id: draft.trip_revision_id,
    description: null,
    free_capacity: 8,
  });
});

it('moves the program across leap day and detects when the new period is too short', () => {
  const draft = draftWithDates('2028-02-28', '2028-03-01', ['2028-02-28', null, '2028-03-01']);
  const fields = { ...tripSettings(draft), start_date: '2028-03-03', end_date: '2028-03-05' };
  expect(tripDaySchedule(draft, fields.start_date, fields.end_date)).toEqual({ shift: true, valid: true });
  expect(tripDaySchedule(draft, fields.start_date, '2028-03-04')).toEqual({ shift: true, valid: false });
  expect(tripSettingsPatch(draft, tripSettingsBody(fields))).toEqual({
    trip_revision_id: draft.trip_revision_id,
    start_date: '2028-03-03',
    end_date: '2028-03-05',
    shift_day_dates: true,
  });
});

it('validates existing day dates without shifting when the trip gets its first period', () => {
  const draft = draftWithDates(null, null, ['2027-01-01']);
  expect(tripDaySchedule(draft, '2027-01-01', '')).toEqual({ shift: false, valid: true });
  expect(tripDaySchedule(draft, '2027-01-02', '')).toEqual({ shift: false, valid: false });
});
