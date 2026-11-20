import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { NodeRequest } from '@nestjs/platform-node';
import { requireSession } from '../identity/identity-session.js';
import { IDENTITY_SETTINGS } from '../identity/identity.config.js';
import type { IdentitySettings } from '../identity/identity.config.js';
import { IdentityService } from '../identity/identity.service.js';
import { travelCommandContext } from './travel-command-context.js';
import {
  createTripInput,
  dayInput,
  routeInput,
  travelUuid,
  tripListInput,
  updateTripInput,
} from './travel-input.js';
import { TravelService } from './travel.service.js';

@Controller()
export class TravelController {
  constructor(
    @Inject(TravelService) private readonly travel: TravelService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IDENTITY_SETTINGS) private readonly identitySettings: IdentitySettings,
  ) {}

  private async commandContext(request: NodeRequest) {
    return travelCommandContext(request, this.identity, this.identitySettings.browserOrigin);
  }

  @Get('trips')
  async listTrips(@Req() request: NodeRequest, @Query() query: unknown) {
    const ownerId = await this.identity.authenticate(requireSession(request));
    return this.travel.listTrips(ownerId, tripListInput(query));
  }

  @Post('trips')
  @HttpCode(201)
  async createTrip(@Req() request: NodeRequest, @Body() body: unknown) {
    const { editor, key } = await this.commandContext(request);
    return this.travel.createTrip(editor, key, createTripInput(body));
  }

  @Get('trips/:tripId/draft')
  async readDraft(@Req() request: NodeRequest, @Param('tripId') tripId: string) {
    const ownerId = await this.identity.authenticate(requireSession(request));
    return this.travel.readDraft(ownerId, travelUuid(tripId));
  }

  @Patch('trips/:tripId')
  async updateTrip(@Req() request: NodeRequest, @Param('tripId') tripId: string, @Body() body: unknown) {
    const { editor, key } = await this.commandContext(request);
    return this.travel.updateTrip(editor, travelUuid(tripId), key, updateTripInput(body));
  }

  @Post('trips/:tripId/days')
  @HttpCode(201)
  async createDay(@Req() request: NodeRequest, @Param('tripId') tripId: string, @Body() body: unknown) {
    const { editor, key } = await this.commandContext(request);
    return this.travel.createDay(editor, travelUuid(tripId), key, dayInput(body, false));
  }

  @Patch('days/:dayId')
  async updateDay(@Req() request: NodeRequest, @Param('dayId') dayId: string, @Body() body: unknown) {
    const { editor, key } = await this.commandContext(request);
    return this.travel.updateDay(editor, travelUuid(dayId), key, dayInput(body, true));
  }

  @Put('days/:dayId/route')
  async bindRoute(@Req() request: NodeRequest, @Param('dayId') dayId: string, @Body() body: unknown) {
    const { editor, key } = await this.commandContext(request);
    return this.travel.bindRoute(editor, travelUuid(dayId), key, routeInput(body));
  }
}
