import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common'
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node'
import { requireJson } from '../http/json-request.js'
import { readToken, requireSession, sessionCookie } from '../identity/identity-session.js'
import { IDENTITY_SETTINGS } from '../identity/identity.config.js'
import type { IdentitySettings } from '../identity/identity.config.js'
import { IdentityService } from '../identity/identity.service.js'
import { PublicationService } from '../travel/publication.service.js'
import { travelActor, travelCommandContext } from '../travel/travel-command-context.js'
import { admissionMode, fields, routeInput, travelUuid } from '../travel/travel-input.js'
import { CatalogService } from './catalog.service.js'
import { applicationTripIds, catalogInput, publishInput, unpublishInput } from './publication-input.js'

@Controller()
export class PublicationController {
  constructor(
    @Inject(PublicationService) private readonly publication: PublicationService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IDENTITY_SETTINGS) private readonly settings: IdentitySettings,
  ) {}

  @Post('trips/:tripId/publish')
  async publish(
    @Param('tripId') id: string, @Body() body: unknown, @Req() request: NodeRequest, @Res() response: NodeResponse,
  ) {
    const { editor, key } = await travelCommandContext(request, this.identity, this.settings.browserOrigin)
    const tripId = travelUuid(id)
    const operation = await this.publication.publish(editor, tripId, key, publishInput(body))
    if (operation.status === 'pending') {
      response.setHeader('location', `/api/v1/trips/${tripId}/publication-operations/${operation.operation_id}`)
    }
    response.status(operation.status === 'pending' ? 202 : 200).json(operation)
  }

  @Get('trips/:tripId/publication-operations/:operationId')
  async status(@Param('tripId') id: string, @Param('operationId') operation: string, @Req() request: NodeRequest) {
    const userId = await this.identity.authenticate(requireSession(request))
    return this.publication.status(userId, travelUuid(id), travelUuid(operation))
  }

  @Post('trips/:tripId/unpublish')
  @HttpCode(200)
  async unpublish(@Param('tripId') id: string, @Body() body: unknown, @Req() request: NodeRequest) {
    const { editor, key } = await travelCommandContext(request, this.identity, this.settings.browserOrigin)
    return this.publication.unpublish(editor, travelUuid(id), key, unpublishInput(body))
  }

  @Post('trips/:tripId/archive')
  @HttpCode(200)
  async archive(@Param('tripId') id: string, @Body() body: unknown, @Req() request: NodeRequest) {
    const { editor, key } = await travelCommandContext(request, this.identity, this.settings.browserOrigin)
    return this.publication.archive(editor, travelUuid(id), key, routeInput(body))
  }

  @Get('catalog/trips')
  list(@Query() query: unknown) {
    return this.catalog.list(catalogInput(query))
  }

  @Get('catalog/filter-options')
  filterOptions(@Query() query: unknown) {
    fields(query, [])
    return this.catalog.filterOptions()
  }

  @Post('trips/:tripId/applications')
  @HttpCode(200)
  async apply(@Param('tripId') id: string, @Body() body: unknown, @Req() request: NodeRequest) {
    const applicant = await travelActor(request, this.identity, this.settings.browserOrigin)
    if (request.headers['content-type'] || Number(request.headers['content-length']) > 0 || request.headers['transfer-encoding']) {
      requireJson(request)
    }
    const input = fields(body === undefined ? {} : body, ['admission_mode'])
    return this.catalog.apply(travelUuid(id), applicant, input.admission_mode === undefined ? 'request' : admissionMode(input.admission_mode))
  }

  @Get('catalog/participation')
  async participation(@Query() query: unknown, @Req() request: NodeRequest, @Res({ passthrough: true }) response: NodeResponse) {
    response.setHeader('vary', 'Cookie')
    const ids = applicationTripIds(query)
    const viewer_id = await this.identity.optionalViewer(readToken(request, sessionCookie))
    const participation = viewer_id ? await this.catalog.participation(viewer_id, ids) : { trip_ids: [], joined_trip_ids: [] }
    return { viewer_id, ...participation }
  }

  @Get('catalog/trips/:tripId')
  detail(@Param('tripId') id: string) {
    return this.catalog.detail(travelUuid(id))
  }
}
