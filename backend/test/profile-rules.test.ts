import {
  expect,
  it,
} from 'vitest';
import {
  achievementGroups,
  travelerLevel,
} from '../src/social/profile-rules.js';

it('uses confirmed personal finishes for every level threshold', () => {
  expect([0, 2, 3, 9, 10, 24, 25, 49, 50, 99, 100, 105].map(n => travelerLevel(n).code)).toEqual([
    'novice', 'novice', 'seeker', 'seeker', 'traveler', 'traveler', 'seasoned', 'seasoned', 'pro', 'pro', 'expert', 'expert',
  ]);
  expect(travelerLevel(100)).toEqual({ code: 'expert', completed: 100, next_at: null });
});

it('awards every crossed grade once and retains earned grades below a later threshold', () => {
  const progress = {
    travel: 100,
    friends: 0,
    cartography: 9,
    organizing: 0,
  };
  const groups = achievementGroups(progress, new Set(['cartographer_2']), 0);
  expect(groups[0]?.earned.map(grade => grade.code)).toEqual(['first_trip', 'on_the_road_1', 'on_the_road_2', 'on_the_road_3', 'on_the_road_4']);
  expect(groups[0]?.next).toBeNull();
  expect(groups[2]?.earned.map(grade => grade.code)).toEqual(['cartographer_1', 'cartographer_2']);
  expect(groups[2]?.next).toEqual({ code: 'cartographer_3', threshold: 50 });
});
