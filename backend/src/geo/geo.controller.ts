import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { NodeRequest } from '@nestjs/platform-node';
import { BffProblem } from '../http/bff-problem.js';
import { uuid } from '../identity/identity-input.js';
import { GeoAccess } from './geo-access.js';
import {
  poiCreateInput,
  poiEditInput,
  poiListInput,
  poiModerationInput,
  poiRemoveInput,
  poiVisibilityInput,
} from './pois/poi-input.js';
import { PoiService } from './pois/poi.service.js';
import { GeoProviders } from './providers/index.js';
import { routePosition } from './routes/route-input.js';
import { RouteService } from './routes/route.service.js';

function id(value: unknown): string {
  return uuid(value).toLowerCase();
}

@Controller()
export class GeoController {
  constructor(
    @Inject(GeoAccess) private readonly access: GeoAccess,
    @Inject(RouteService) private readonly routes: RouteService,
    @Inject(PoiService) private readonly pois: PoiService,
    @Inject(GeoProviders) private readonly providers: GeoProviders,
  ) {}

  @Get('routes/:routeId')
  async readRoute(@Req() request: NodeRequest, @Param('routeId') routeId: string) {
    return this.routes.read(await this.access.viewer(request), id(routeId));
  }

  @Put('routes/:routeId')
  async replaceRoute(@Req() request: NodeRequest, @Param('routeId') routeId: string, @Body() body: unknown) {
    const { actorId, key } = await this.access.mutation(request);
    return this.routes.replace(actorId, id(routeId), key, body);
  }

  @Post('routes/:routeId/restore')
  @HttpCode(200)
  async restoreRoute(@Req() request: NodeRequest, @Param('routeId') routeId: string, @Body() body: unknown) {
    const { actorId, key } = await this.access.mutation(request);
    return this.routes.restore(actorId, id(routeId), key, body);
  }

  @Post('tracks/:trackId/split')
  @HttpCode(200)
  async splitTrack(@Req() request: NodeRequest, @Param('trackId') trackId: string, @Body() body: unknown) {
    const { actorId, key } = await this.access.mutation(request);
    return this.routes.split(actorId, id(trackId), key, body);
  }

  @Post('routing/calculate')
  @HttpCode(200)
  async preview(@Req() request: NodeRequest, @Body() body: unknown) {
    await this.access.confirmMutation(request, true);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['from', 'to', 'transport_mode', 'build_mode'].includes(key))) {
      throw new BffProblem('INVALID_REQUEST');
    }
    const fields = body as Record<string, unknown>;
    const mode = fields.build_mode === undefined ? 'automatic' : fields.build_mode;
    const transport = fields.transport_mode;
    if ((mode !== 'automatic' && mode !== 'straight')
      || (transport !== 'car' && transport !== 'bicycle' && transport !== 'foot')) {
      throw new BffProblem('INVALID_REQUEST');
    }
    const from = routePosition(fields.from);
    const to = routePosition(fields.to);
    if (from.lat === to.lat && from.lon === to.lon) {
      throw new BffProblem('INVALID_REQUEST');
    }
    const preview = await this.providers.preview({
      from,
      to,
      transport_mode: transport,
      build_mode: mode,
    });
    if (!preview.geometry) {
      return preview;
    }
    return { ...preview, elevation_profile: await this.providers.elevation(preview.geometry) };
  }

  @Get('poi-categories')
  categories() {
    return this.pois.categories();
  }

  @Get('pois')
  async listPois(@Req() request: NodeRequest, @Query() query: unknown) {
    const input = poiListInput(query);
    const actor = input.scope === 'global' ? null : await this.access.viewer(request);
    return this.pois.list(actor, input);
  }

  @Get('pois/:poiId')
  async readPoi(@Req() request: NodeRequest, @Param('poiId') poiId: string) {
    return this.pois.get(await this.access.optionalViewer(request), id(poiId));
  }

  @Post('pois')
  @HttpCode(201)
  async createPoi(@Req() request: NodeRequest, @Body() body: unknown) {
    const { actorId, key } = await this.access.mutation(request);
    return this.pois.create(actorId, key, poiCreateInput(body));
  }

  @Patch('pois/:poiId')
  async updatePoi(@Req() request: NodeRequest, @Param('poiId') poiId: string, @Body() body: unknown) {
    const { actorId, key } = await this.access.mutation(request);
    return this.pois.edit(actorId, id(poiId), key, poiEditInput(body));
  }

  @Delete('pois/:poiId')
  @HttpCode(204)
  async removePoi(@Req() request: NodeRequest, @Param('poiId') poiId: string, @Body() body: unknown) {
    const { actorId, key } = await this.access.mutation(request);
    await this.pois.remove(actorId, id(poiId), key, poiRemoveInput(body));
  }

  @Patch('pois/:poiId/visibility')
  async changeVisibility(@Req() request: NodeRequest, @Param('poiId') poiId: string, @Body() body: unknown) {
    const { actorId, key } = await this.access.mutation(request);
    return this.pois.changeVisibility(actorId, id(poiId), key, poiVisibilityInput(body));
  }

  @Post('pois/:poiId/moderation')
  @HttpCode(200)
  async moderatePoi(@Req() request: NodeRequest, @Param('poiId') poiId: string, @Body() body: unknown) {
    const { actorId, key } = await this.access.mutation(request);
    return this.pois.moderate(actorId, id(poiId), key, poiModerationInput(body));
  }

  @Put('trips/:tripId/pois/:poiId')
  @HttpCode(204)
  async attachPoi(@Req() request: NodeRequest, @Param('tripId') tripId: string, @Param('poiId') poiId: string) {
    const { actorId, key } = await this.access.mutation(request, false);
    await this.pois.attach(actorId, id(tripId), id(poiId), key);
  }

  @Get('pois/:poiId/media/:mediaId')
  async readPoiMedia(@Req() request: NodeRequest, @Param('poiId') poiId: string, @Param('mediaId') mediaId: string) {
    const media = await this.pois.media(await this.access.optionalViewer(request), id(poiId), id(mediaId));
    return new StreamableFile(media.bytes, { type: media.contentType });
  }
}
