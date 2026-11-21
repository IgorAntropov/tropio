import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import type { NodeRequest } from '@nestjs/platform-node';
import { requireSession } from '../../identity/identity-session.js';
import { IDENTITY_SETTINGS } from '../../identity/identity.config.js';
import type { IdentitySettings } from '../../identity/identity.config.js';
import { IdentityService } from '../../identity/identity.service.js';
import { travelCommandContext } from '../travel-command-context.js';
import { parsePersonalEquipment } from './equipment-input.js';
import { EquipmentLibrary } from './equipment-library.service.js';

@Controller('me/equipment')
export class EquipmentLibraryController {
  constructor(
    @Inject(EquipmentLibrary) private readonly library: EquipmentLibrary,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IDENTITY_SETTINGS) private readonly identitySettings: IdentitySettings,
  ) {}

  @Get()
  async list(@Req() request: NodeRequest) {
    const userId = await this.identity.authenticate(requireSession(request));
    return this.library.list(userId);
  }

  @Post()
  async create(@Req() request: NodeRequest, @Body() body: unknown) {
    const { editor, key } = await travelCommandContext(request, this.identity, this.identitySettings.browserOrigin);
    return this.library.add(editor, key, parsePersonalEquipment(body));
  }
}
