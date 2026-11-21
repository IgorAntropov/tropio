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

it('creates a trip with just a title and leaves the optional fields empty', () => {
  expect(tripSettingsBody({ ...tripSettings(), title: '  Перевал  ' })).toEqual({
    title: 'Перевал',
    description: null,
    start_date: null,
    end_date: null,
    free_capacity: null,
  });
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
