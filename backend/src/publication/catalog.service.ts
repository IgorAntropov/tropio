import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { GeoPublicationService } from '../geo/publication/geo-publication.service.js';
import { BffProblem } from '../http/bff-problem.js';
import { IdentityService } from '../identity/identity.service.js';
import type { PublicOrganizer } from '../identity/identity.service.js';
import { AccountTrips } from '../travel/account-trips.js';
import type { AccountTripFilter } from '../travel/account-trips.js';
import { PublicCatalog } from '../travel/public-catalog.js';
import type { Candidate } from '../travel/public-catalog.js';
import type { AdmissionMode } from '../travel/travel-input.js';
import type { TravelEditor } from '../travel/travel.service.js';
import type { RosterAction } from '../travel/trip-applications.js';
import { TripApplications } from '../travel/trip-applications.js';
import type { catalogInput } from './publication-input.js';

function accountFields({ tripId, publication_id, cover_id, snapshot, confirmed_participants, current_lifecycle }: Candidate, organizer: PublicOrganizer | null) {
  return {
    trip_id: tripId,
    publication_id,
    cover_id,
    organizer,
    title: snapshot.title,
    description: snapshot.description ?? '',
    start_date: snapshot.start_date,
    end_date: snapshot.end_date,
    day_count: snapshot.days.length,
    free_capacity: snapshot.free_capacity,
    difficulty: snapshot.difficulty,
    trip_type: snapshot.trip_type,
    lifecycle: current_lifecycle,
    confirmed_participants,
  };
}

function fields(candidate: Candidate, organizer: PublicOrganizer | null) {
  return { ...accountFields(candidate, organizer), applications_open: candidate.applications_open, admission_mode: candidate.snapshot.admission_mode ?? 'request' };
}

function manifest({ tripId, operationId, routes, poiIds }: Candidate) {
  return {
    tripId,
    operationId,
    routes,
    poiIds,
  };
}

function matches(candidate: Candidate, row: { publication_id: string; access_generation: string; ownerId: string }) {
  return candidate.publication_id === row.publication_id && candidate.access_generation === row.access_generation
    && candidate.ownerId === row.ownerId;
}

type CatalogInput = ReturnType<typeof catalogInput>;
type Summary = ReturnType<typeof fields> & { route_count: number; total_distance_m: number; distance_m?: number; start: { lon: number; lat: number } };

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PublicCatalog) private readonly travel: PublicCatalog,
    @Inject(GeoPublicationService) private readonly geo: GeoPublicationService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(TripApplications) private readonly applications: TripApplications,
    @Inject(AccountTrips) private readonly account: AccountTrips,
  ) {}

  filterOptions() {
    return this.travel.filterOptions();
  }

  async apply(tripId: string, applicant: TravelEditor, mode: AdmissionMode) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const candidate = await this.travel.candidate(tripId);
      if (!candidate) {
        throw new BffProblem('NOT_FOUND');
      }
      const status = await this.applications.submit(candidate, applicant, mode, async () => {
        const [summary] = await this.geo.readSummaries([manifest(candidate)]);
        if (!summary) {
          throw new BffProblem('NOT_FOUND');
        }
      });
      if (status) {
        return { status };
      }
    }
    throw new BffProblem('DEPENDENCY_UNAVAILABLE');
  }

  async roster(tripId: string, userId: string) {
    const roster = await this.applications.roster(userId, tripId);
    const profiles = await this.identity.publicOrganizers([...new Set(roster.items.map(item => item.user_id))]);
    const can_accept = roster.can_accept && await this.visibleRoute(tripId);
    return {
      ...roster,
      viewer_id: userId,
      can_accept,
      items: roster.items.map(item => ({ ...item, profile: profiles.get(item.user_id) ?? null })),
    };
  }

  async decideRoster(tripId: string, editor: TravelEditor, entryId: string, action: RosterAction) {
    const candidate = action === 'accept' ? await this.travel.candidate(tripId) : null;
    return this.applications.decide(editor, tripId, entryId, action, async (publicationId, generation) => {
      if (!candidate || candidate.publication_id !== publicationId || candidate.access_generation !== generation) {
        throw new BffProblem('TRIP_APPLICATION_UNAVAILABLE');
      }
      const [summary] = await this.geo.readSummaries([manifest(candidate)]);
      if (!summary) {
        throw new BffProblem('TRIP_APPLICATION_UNAVAILABLE');
      }
    });
  }

  private async visibleRoute(tripId: string) {
    const candidate = await this.travel.candidate(tripId);
    if (!candidate) {
      return false;
    }
    const [summary] = await this.geo.readSummaries([manifest(candidate)]);
    return !!summary;
  }

  async participation(userId: string, tripIds: string[]) {
    const candidates = await this.travel.participationForViewer(userId, tripIds);
    const trip_ids: string[] = [];
    const joined_trip_ids: string[] = [];
    const owned_trip_ids: string[] = [];
    const saved_trip_ids: string[] = [];
    const result = {
      trip_ids,
      joined_trip_ids,
      owned_trip_ids,
      saved_trip_ids,
    };
    if (!candidates.length) {
      return result;
    }
    const summaries = await this.geo.readSummaries(candidates.map(manifest));
    const confirmed = await this.travel.confirm(candidates);
    for (const [index, candidate] of candidates.entries()) {
      const current = confirmed.get(candidate.tripId);
      if (summaries[index] && current && matches(candidate, current)) {
        if (candidate.pending) {
          trip_ids.push(candidate.tripId);
        }
        if (candidate.joined) {
          joined_trip_ids.push(candidate.tripId);
        }
        if (candidate.ownerId === userId) {
          owned_trip_ids.push(candidate.tripId);
        }
        else if (candidate.saved) {
          saved_trip_ids.push(candidate.tripId);
        }
      }
    }
    return result;
  }

  async cover(id: string, coverId: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const candidate = await this.travel.candidate(id);
      if (!candidate || candidate.cover_id !== coverId) {
        throw new BffProblem('NOT_FOUND');
      }
      const [summary] = await this.geo.readSummaries([manifest(candidate)]);
      if (!summary) {
        throw new BffProblem('NOT_FOUND');
      }
      const image = await this.travel.cover(candidate, coverId);
      if (image) {
        return image;
      }
    }
    throw new BffProblem('DEPENDENCY_UNAVAILABLE');
  }

  async detail(id: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const candidate = await this.travel.candidate(id);
      if (!candidate) {
        throw new BffProblem('NOT_FOUND');
      }
      const geo = await this.geo.read(manifest(candidate));
      const organizer = geo ? (await this.identity.publicOrganizers([candidate.ownerId])).get(candidate.ownerId) ?? null : null;
      const current = (await this.travel.confirm([candidate])).get(id);
      if (!current) {
        throw new BffProblem('NOT_FOUND');
      }
      if (!matches(candidate, current)) {
        continue;
      }
      if (!geo) {
        throw new BffProblem('NOT_FOUND');
      }
      const days = geo.days.map((day, index) => {
        const stored = candidate.snapshot.days[index];
        if (!stored) {
          throw new BffProblem('DEPENDENCY_UNAVAILABLE');
        }
        return {
          position: stored.position,
          local_date: stored.local_date,
          description: stored.description,
          lines: day.lines,
          legs: day.legs,
        };
      });
      if (days.length !== candidate.snapshot.days.length) {
        throw new BffProblem('DEPENDENCY_UNAVAILABLE');
      }
      return {
        ...fields(candidate, organizer),
        equipment: candidate.snapshot.equipment ?? [],
        start: geo.start,
        route_count: geo.route_count,
        total_distance_m: geo.total_distance_m,
        days,
        pois: geo.pois,
      };
    }
    throw new BffProblem('DEPENDENCY_UNAVAILABLE');
  }

  async favorite(userId: string, tripId: string) {
    if (!await this.account.isFavorite(userId, tripId)) {
      return false;
    }
    const { visible } = await this.visibleCandidates(async () => {
      const candidate = await this.travel.candidate(tripId);
      return candidate ? [candidate] : [];
    });
    return visible.length > 0;
  }

  async setFavorite(tripId: string, editor: TravelEditor, saved: boolean) {
    if (!saved) {
      return this.account.removeFavorite(editor, tripId);
    }
    const candidate = await this.travel.candidate(tripId);
    if (!candidate) {
      throw new BffProblem('NOT_FOUND');
    }
    return this.account.addFavorite(editor, candidate, async () => {
      const [summary] = await this.geo.readSummaries([manifest(candidate)]);
      if (!summary) {
        throw new BffProblem('NOT_FOUND');
      }
    });
  }

  async accountTrips(userId: string, input: AccountTripFilter) {
    const owned = input.collection === 'created' || input.collection === 'all'
      ? await this.account.created(userId, input)
      : [];
    const [organizers, summaries] = await Promise.all([
      this.identity.publicOrganizers(owned.length ? [userId] : []),
      this.geo.readOwnedSummaries(userId, owned),
    ]);
    const organizer = organizers.get(userId) ?? null;
    const items = owned.map(({ route_ids, ...item }) => {
      const summary = summaries.get(item.trip_id);
      return {
        ...item,
        route_count: route_ids.length,
        total_distance_m: route_ids.length ? summary?.total_distance_m ?? null : 0,
        trip_type: summary?.trip_type ?? null,
        is_owner: true,
        participation_status: null as 'pending' | 'joined' | null,
        organizer,
      };
    });
    if (input.collection !== 'created' && input.status !== 'draft' && input.status !== 'archived') {
      let after = input.cursor;
      const size = Math.max(16, input.limit + 1);
      let visibleCount = 0;
      do {
        const page = await this.visibleCandidates(() => this.account.candidates(userId, input, after, size));
        for (const { candidate, summary, organizer: foreignOrganizer } of page.visible) {
          items.push({
            ...accountFields(candidate, foreignOrganizer),
            route_count: summary.route_count,
            total_distance_m: summary.total_distance_m,
            is_owner: false,
            saved: candidate.saved,
            participation_status: candidate.participation_status,
            starting_soon: candidate.starting_soon,
            pending_count: 0,
            archived: false,
          });
          visibleCount++;
        }
        after = page.candidates.length === size ? page.candidates.at(-1)!.tripId : null;
      } while (after && visibleCount <= input.limit);
    }
    items.sort((a, b) => a.trip_id < b.trip_id ? -1 : a.trip_id > b.trip_id ? 1 : 0);
    const page = items.slice(0, input.limit);
    return { viewer_id: userId, items: page, next_cursor: items.length > input.limit ? page.at(-1)!.trip_id : null };
  }

  async joinedTripCounts(userId: string) {
    const counts = { planned: 0, in_progress: 0, completed: 0 };
    let cursor: string | null = null;
    const size = 100;
    do {
      const input: AccountTripFilter = {
        collection: 'joined',
        status: 'all',
        query: '',
        limit: size,
        cursor,
      };
      const page = await this.visibleCandidates(() => this.account.candidates(userId, input, cursor, size), { participantId: userId });
      for (const { candidate } of page.visible) {
        if (candidate.current_lifecycle !== 'cancelled') {
          counts[candidate.current_lifecycle]++;
        }
      }
      cursor = page.candidates.length === size ? page.candidates.at(-1)!.tripId : null;
    } while (cursor);
    return counts;
  }

  async publicProfileFacts(organizerId: string) {
    const trips = {
      created: 0,
      planned: 0,
      in_progress: 0,
      completed: 0,
      archived: 0,
    };
    const progress = { cartography: 0, organizing: 0, travel: 0 };
    const visibleIds: string[] = [];
    let cursor: string | null = null;
    const limit = 100;
    do {
      const page = await this.visibleCandidates(() => this.travel.organizerCandidates(organizerId, cursor, limit));
      for (const { candidate, summary } of page.visible) {
        visibleIds.push(candidate.tripId);
        trips.created++;
        if (candidate.current_lifecycle !== 'cancelled') {
          trips[candidate.current_lifecycle]++;
        }
        if (candidate.authored && summary.total_distance_m > 0) {
          progress.cartography++;
        }
        if (candidate.guided) {
          progress.organizing++;
        }
        if (candidate.finished) {
          progress.travel++;
        }
      }
      cursor = page.candidates.length === limit ? page.candidates.at(-1)!.tripId : null;
    } while (cursor);
    return { trips, progress, visibleIds };
  }

  private async visibleCandidates<T extends Candidate>(load: () => Promise<T[]>, options: { participantId?: string } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const candidates = await load();
      if (!candidates.length) {
        return { candidates, visible: [] };
      }
      const summaries = await this.geo.readSummaries(candidates.map(manifest));
      if (summaries.length !== candidates.length) {
        throw new BffProblem('DEPENDENCY_UNAVAILABLE');
      }
      const owners = new Set(candidates.filter((_, index) => summaries[index]).map(item => item.ownerId));
      const organizers = options.participantId ? new Map<string, PublicOrganizer>() : await this.identity.publicOrganizers([...owners]);
      const confirmed = await this.travel.confirm(candidates, options.participantId);
      if (candidates.some((item) => {
        const current = confirmed.get(item.tripId);
        return current && (!matches(item, current) || item.current_lifecycle !== current.current_lifecycle);
      })) {
        continue;
      }
      const visible = candidates.flatMap((candidate, index) => {
        const summary = summaries[index];
        return summary && confirmed.has(candidate.tripId) ? [{ candidate, summary, organizer: organizers.get(candidate.ownerId) ?? null }] : [];
      });
      return { candidates, visible };
    }
    throw new BffProblem('DEPENDENCY_UNAVAILABLE');
  }

  async list(input: CatalogInput) {
    let after = input.after;
    const items: Summary[] = [];
    const seen = new Set<string>();
    const size = Math.max(16, input.limit + 1);
    do {
      const { candidates, visible } = await this.visibleCandidates(() => this.travel.candidates(input.filters, after, size));
      for (const { candidate, summary, organizer } of visible) {
        const item = { ...fields(candidate, organizer), ...summary, ...(input.filters.near ? { distance_m: candidate.distance_m } : {}) };
        if (seen.has(item.trip_id)) {
          continue;
        }
        if (items.length === input.limit) {
          const last = items[items.length - 1]!;
          return { items, next_cursor: input.encode({ id: last.trip_id, distance: last.distance_m ?? 0 }) };
        }
        seen.add(item.trip_id);
        items.push(item);
      }
      const last = candidates.at(-1);
      after = last && candidates.length === size ? { id: last.tripId, distance: last.distance_m } : null;
    } while (after);
    return { items, next_cursor: null };
  }
}
