const grades = {
  travel: [
    { code: 'first_trip', threshold: 1 },
    { code: 'on_the_road_1', threshold: 10 },
    { code: 'on_the_road_2', threshold: 25 },
    { code: 'on_the_road_3', threshold: 50 },
    { code: 'on_the_road_4', threshold: 100 },
  ],
  friends: [
    { code: 'first_friend', threshold: 1 },
    { code: 'sociable', threshold: 20 },
    { code: 'life_of_the_party', threshold: 50 },
  ],
  cartography: [
    { code: 'cartographer_1', threshold: 1 },
    { code: 'cartographer_2', threshold: 10 },
    { code: 'cartographer_3', threshold: 50 },
    { code: 'cartographer_4', threshold: 100 },
  ],
  organizing: [
    { code: 'guide_1', threshold: 1 },
    { code: 'guide_2', threshold: 5 },
    { code: 'guide_3', threshold: 20 },
    { code: 'guide_4', threshold: 50 },
  ],
};

export type Progress = Record<keyof typeof grades, number>;

export function achievementGroups(progress: Progress, awarded: Set<string>, peakFriends: number) {
  const groups = Object.keys(grades) as (keyof typeof grades)[];
  return groups.map((group) => {
    const value = progress[group];
    const highest = group === 'friends' ? peakFriends : value;
    const earned = grades[group].filter(grade => awarded.has(grade.code) || grade.threshold <= highest);
    const next = grades[group].find(grade => !earned.includes(grade)) ?? null;
    return {
      group,
      progress: value,
      earned,
      next,
    };
  });
}

const levels = [
  { code: 'novice', minimum: 0 },
  { code: 'seeker', minimum: 3 },
  { code: 'traveler', minimum: 10 },
  { code: 'seasoned', minimum: 25 },
  { code: 'pro', minimum: 50 },
  { code: 'expert', minimum: 100 },
];

export function travelerLevel(completed: number) {
  const current = levels.findLastIndex(level => level.minimum <= completed);
  return { code: levels[current]!.code, completed, next_at: levels[current + 1]?.minimum ?? null };
}
