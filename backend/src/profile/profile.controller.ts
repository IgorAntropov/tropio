import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Req,
} from '@nestjs/common';
import type { NodeRequest } from '@nestjs/platform-node';
import { GeoPublicationService } from '../geo/publication/geo-publication.service.js';
import { uuid } from '../identity/identity-input.js';
import { requireSession } from '../identity/identity-session.js';
import { IdentityService } from '../identity/identity.service.js';
import { CatalogService } from '../publication/catalog.service.js';
import { ProfileSocial } from '../social/profile-social.js';
import { ProfileTrips } from '../travel/profile-trips.js';

@Controller()
export class ProfileController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(ProfileTrips) private readonly trips: ProfileTrips,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(GeoPublicationService) private readonly geo: GeoPublicationService,
    @Inject(ProfileSocial) private readonly social: ProfileSocial,
  ) {}

  @Get('me/overview')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async overview(@Req() request: NodeRequest) {
    const token = requireSession(request);
    const userId = await this.identity.authenticate(token);
    const summary = await this.ownOverview(userId);
    await this.identity.authenticate(token);
    return { viewer_id: userId, ...summary };
  }

  private async ownOverview(userId: string) {
    const [own, joined] = await Promise.all([this.trips.ownFacts(userId), this.catalog.joinedTripCounts(userId)]);
    const cartography = await this.geo.countMappedTrips(own.routes);
    const summary = await this.social.overview(userId, { ...own.completions, cartography });
    return {
      trips: {
        ...own.stats,
        planned: own.stats.planned + joined.planned,
        in_progress: own.stats.in_progress + joined.in_progress,
        completed: own.stats.completed + joined.completed,
      },
      ...summary,
    };
  }

  @Get('users/:id/overview')
  @Header('Cache-Control', 'no-store')
  async publicOverview(@Param('id') id: string) {
    return (await this.visitorView(uuid(id))).overview;
  }

  @Get('me/visiting/:id')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async visiting(@Param('id') id: string, @Req() request: NodeRequest) {
    const userId = uuid(id).toLowerCase();
    const token = requireSession(request);
    const viewerId = await this.identity.authenticate(token);
    const result = viewerId === userId
      ? { overview: await this.ownOverview(userId), profile: (await this.identity.getVisitingProfile(userId, 'owner')).profile }
      : await this.visitorView(userId, viewerId);
    await this.identity.authenticate(token);
    return { viewer_id: viewerId, ...result };
  }

  private async visitorView(userId: string, viewerId?: string) {
    await this.identity.getPublicProfile(userId);
    const { trips, progress, visibleIds } = await this.catalog.publicProfileFacts(userId);
    const summary = await this.social.publicOverview(userId, visibleIds, progress);
    const friend = viewerId && await this.social.areFriends(userId, viewerId);
    let access = await this.identity.getVisitingProfile(userId, friend ? 'friends' : 'public');
    if (friend && !await this.social.areFriends(userId, viewerId)) {
      access = await this.identity.getVisitingProfile(userId, 'public');
    }
    return {
      profile: access.profile,
      overview: {
        trips: access.trips ? trips : null,
        rating: summary.rating,
        level: access.achievements ? summary.level : null,
        achievements: access.achievements ? summary.achievements : null,
      },
    };
  }
}
