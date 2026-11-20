import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { ServiceDatabase } from '../database/service-database.js';
import { IDENTITY_SETTINGS } from './identity.config.js';
import type { IdentitySettings } from './identity.config.js';

@Injectable()
export class IdentityDatabase extends ServiceDatabase {
  constructor(@Inject(IDENTITY_SETTINGS) settings: IdentitySettings) {
    super(settings.databaseUrl, 'tropio_identity_runtime');
  }
}
