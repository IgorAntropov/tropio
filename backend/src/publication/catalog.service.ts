import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { GeoPublicationService } from '../geo/publication/geo-publication.service.js';
import { BffProblem } from '../http/bff-problem.js';
import { IdentityService } from '../identity/identity.service.js';
import type { PublicOrganizer } from '../identity/identity.service.js';
import { PublicCatalog } from '../travel/public-catalog.js';
import type { Candidate } from '../travel/public-catalog.js';
import type { AdmissionMode } from '../travel/travel-input.js';
import type { TravelEditor } from '../travel/travel.service.js';
import { TripApplications } from '../travel/trip-applications.js';
import type {
  catalogInput,
  CatalogPosition,
} from './publication-input.js';

function fields({ tripId, publication_id, cover_id, snapshot, applications_open, confirmed_participants }: Candidate, organizer: PublicOrganizer | null) {
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
    lifecycle: snapshot.lifecycle,
    applications_open,
    admission_mode: snapshot.admission_mode ?? 'request',
    confirmed_participants,
  };
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
type Summary = ReturnType<typeof fields> & { distance_m?: number; start: { lon: number; lat: number } };

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PublicCatalog) private readonly travel: PublicCatalog,
    @Inject(GeoPublicationService) private readonly geo: GeoPublicationService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(TripApplications) private readonly applications: TripApplications,
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
        const [start] = await this.geo.readStarts([manifest(candidate)]);
        if (!start) {
          throw new BffProblem('NOT_FOUND');
        }
      });
      if (status) {
        return { status };
      }
    }
    throw new BffProblem('DEPENDENCY_UNAVAILABLE');
  }

  async participation(userId: string, tripIds: string[]) {
    const candidates = await this.travel.participationForViewer(userId, tripIds);
    const trip_ids: string[] = [];
    const joined_trip_ids: string[] = [];
    if (!candidates.length) {
      return { trip_ids, joined_trip_ids };
    }
    const starts = await this.geo.readStarts(candidates.map(manifest));
    const confirmed = await this.travel.confirm(candidates);
    for (const [index, candidate] of candidates.entries()) {
      const current = confirmed.get(candidate.tripId);
      if (starts[index] && current && matches(candidate, current)) {
        const ids = candidate.participation === 'joined' ? joined_trip_ids : trip_ids;
        ids.push(candidate.tripId);
      }
    }
    return { trip_ids, joined_trip_ids };
  }

  async cover(id: string, coverId: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const candidate = await this.travel.candidate(id);
      if (!candidate || candidate.cover_id !== coverId) {
        throw new BffProblem('NOT_FOUND');
      }
      const [start] = await this.geo.readStarts([manifest(candidate)]);
      if (!start) {
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
        days,
        pois: geo.pois,
      };
    }
    throw new BffProblem('DEPENDENCY_UNAVAILABLE');
  }

  private async batch(filters: CatalogInput['filters'], after: CatalogPosition | null, size: number) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const candidates = await this.travel.candidates(filters, after, size);
      const last = candidates.at(-1);
      if (!last) {
        return { allowed: [], next: null };
      }
      const starts = await this.geo.readStarts(candidates.map(manifest));
      if (starts.length !== candidates.length) {
        throw new BffProblem('DEPENDENCY_UNAVAILABLE');
      }
      const owners = new Set(candidates.filter((_, index) => starts[index]).map(item => item.ownerId));
      const organizers = await this.identity.publicOrganizers([...owners]);
      const confirmed = await this.travel.confirm(candidates);
      if (candidates.some((item) => {
        const current = confirmed.get(item.tripId);
        return current && !matches(item, current);
      })) {
        continue;
      }
      const allowed: Summary[] = [];
      for (const [index, item] of candidates.entries()) {
        const start = starts[index];
        if (start && confirmed.has(item.tripId)) {
          allowed.push({ ...fields(item, organizers.get(item.ownerId) ?? null), start, ...(filters.near ? { distance_m: item.distance_m } : {}) });
        }
      }
      return { allowed, next: candidates.length === size ? { id: last.tripId, distance: last.distance_m } : null };
    }
    throw new BffProblem('DEPENDENCY_UNAVAILABLE');
  }

  async list(input: CatalogInput) {
    let after = input.after;
    const items: Summary[] = [];
    const seen = new Set<string>();
    const size = Math.max(16, input.limit + 1);
    do {
      const { allowed, next } = await this.batch(input.filters, after, size);
      for (const item of allowed) {
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
      after = next;
    } while (after);
    return { items, next_cursor: null };
  }
}
