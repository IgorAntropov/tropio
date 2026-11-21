import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { ServiceDatabase } from '../database/service-database.js';
import { BffProblem } from '../http/bff-problem.js';
import { ProfileTrips } from '../travel/profile-trips.js';
import type { Completion } from '../travel/profile-trips.js';
import {
  achievementGroups,
  travelerLevel,
} from './profile-rules.js';
import type { Progress } from './profile-rules.js';

export const SOCIAL_DATABASE_URL = Symbol('social database url');

@Injectable()
export class SocialDatabase extends ServiceDatabase {
  constructor(@Inject(SOCIAL_DATABASE_URL) databaseUrl?: string) {
    super(databaseUrl, 'tropio_social_runtime');
  }
}

@Injectable()
export class ProfileSocial {
  constructor(
    @Inject(SocialDatabase) private readonly database: SocialDatabase,
    @Inject(ProfileTrips) private readonly travel: ProfileTrips,
  ) {}

  async rateOrganizer(completion: Completion, stars: number) {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new BffProblem('INVALID_REQUEST');
    }
    const fact = await this.travel.completion(completion.participant_id, completion.trip_id);
    if (!fact || fact.organizer_id !== completion.organizer_id || fact.participant_id === fact.organizer_id) {
      throw new BffProblem('NOT_FOUND');
    }
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO social.organizer_ratings (organizer_id, participant_id, trip_id, stars)
         VALUES ($1, $2, $3, $4) ON CONFLICT (organizer_id, participant_id) DO NOTHING`,
        [fact.organizer_id, fact.participant_id, fact.trip_id, stars],
      );
    });
  }

  async areFriends(userId: string, otherId: string) {
    return this.database.transaction(async (client) => {
      const result = await client.query(
        `SELECT FROM social.friendships WHERE (first_user_id,second_user_id) =
           (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) AND ended_at IS NULL`,
        [userId, otherId],
      );
      return result.rowCount === 1;
    });
  }

  overview(userId: string, facts: Omit<Progress, 'friends'>) {
    return this.database.transaction(async (client) => {
      const { rows: [rating] } = await client.query<{ average: number | null; count: number }>(
        'SELECT avg(stars)::float8 AS average, count(*)::int AS count FROM social.organizer_ratings WHERE organizer_id = $1', [userId],
      );
      const { rows: [friends] } = await client.query<{ count: number; peak: number }>(
        `WITH history AS (
           SELECT confirmed_at, ended_at FROM social.friendships WHERE first_user_id = $1 OR second_user_id = $1
         ), changes AS (
           SELECT confirmed_at AS occurred_at, 1 AS delta FROM history
           UNION ALL SELECT ended_at, -1 FROM history WHERE ended_at IS NOT NULL
         ), totals AS (
           SELECT sum(sum(delta)) OVER (ORDER BY occurred_at) AS n FROM changes GROUP BY occurred_at
         ) SELECT (SELECT count(*)::int FROM history WHERE ended_at IS NULL) AS count,
                  COALESCE((SELECT max(n)::int FROM totals), 0) AS peak`, [userId],
      );
      const { rows: awarded } = await client.query<{ code: string }>('SELECT code FROM social.earned_grades WHERE user_id = $1', [userId]);
      const previous = new Set(awarded.map(row => row.code));
      const achievements = achievementGroups({ ...facts, friends: friends!.count }, previous, friends!.peak);
      const added = achievements.flatMap(group => group.earned.map(grade => grade.code)).filter(code => !previous.has(code));
      if (added.length) {
        await client.query(
          'INSERT INTO social.earned_grades (user_id, code) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING',
          [userId, added],
        );
      }
      return { rating: rating!, level: travelerLevel(facts.travel), achievements };
    });
  }

  publicOverview(userId: string, visibleIds: string[], progress: Omit<Progress, 'friends'>) {
    return this.database.transaction(async (client) => {
      const { rows: [rating] } = await client.query<{ average: number | null; count: number }>(
        `SELECT avg(stars)::float8 AS average, count(*)::int AS count
         FROM social.organizer_ratings WHERE organizer_id = $1 AND trip_id = ANY($2::uuid[])`,
        [userId, visibleIds],
      );
      return {
        rating: rating!,
        level: travelerLevel(progress.travel),
        achievements: achievementGroups({ ...progress, friends: 0 }, new Set(), 0).filter(group => group.group !== 'friends'),
      };
    });
  }
}
