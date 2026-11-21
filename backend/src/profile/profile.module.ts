import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import {
  ProfileSocial,
  SOCIAL_DATABASE_URL,
  SocialDatabase,
} from '../social/profile-social.js';
import { ProfileController } from './profile.controller.js';

@Module({})
export class ProfileModule {
  static configure(identity: DynamicModule, travel: DynamicModule, geo: DynamicModule, publication: DynamicModule, socialUrl?: string): DynamicModule {
    return {
      module: ProfileModule,
      imports: [identity, travel, geo, publication],
      controllers: [ProfileController],
      providers: [{ provide: SOCIAL_DATABASE_URL, useValue: socialUrl }, SocialDatabase, ProfileSocial],
    };
  }
}
