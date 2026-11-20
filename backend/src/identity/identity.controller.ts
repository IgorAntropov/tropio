import { isIP } from 'node:net';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type {
  NodeRequest,
  NodeResponse,
} from '@nestjs/platform-node';
import { requireJson } from '../http/json-request.js';
import { equalSecret } from './identity-crypto.js';
import {
  avatarInput,
  emailInput,
  loginInput,
  profileInput,
  registerInput,
  resetInput,
  tokenInput,
  uuid,
} from './identity-input.js';
import { IDENTITY_SETTINGS } from './identity.config.js';
import type { IdentitySettings } from './identity.config.js';
import {
  checkOrigin,
  mutationSession,
  readToken,
  registrationCookie,
  requireSession,
  sessionCookie,
} from './identity-session.js';
import {
  IdentityService,
  registrationLifetimeSeconds,
} from './identity.service.js';

function source(request: NodeRequest, proxySecret: string | undefined): string {
  const proof = request.headers['x-tropio-proxy-secret'];
  const address = request.headers['x-tropio-client-ip'];
  if (proxySecret && typeof proof === 'string' && equalSecret(proof, proxySecret)
    && typeof address === 'string' && isIP(address)) {
    return address;
  }

  return request.socket.remoteAddress ?? 'unknown';
}

@Controller()
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IDENTITY_SETTINGS) private readonly settings: IdentitySettings,
  ) {}

  private cookieOptions(path: string) {
    return {
      path,
      secure: this.settings.secureCookies,
      httpOnly: true,
      sameSite: 'lax',
    } as const;
  }

  private setSession(response: NodeResponse, token: string, expiresAt: Date): void {
    response.cookie(sessionCookie, token, {
      ...this.cookieOptions('/api/v1'),
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }

  private setRegistration(response: NodeResponse, token: string): void {
    response.cookie(registrationCookie, token, {
      ...this.cookieOptions('/api/v1/auth'),
      maxAge: registrationLifetimeSeconds * 1000,
    });
  }

  @Post('auth/register')
  @HttpCode(202)
  async register(
    @Req() request: NodeRequest,
    @Res({ passthrough: true }) response: NodeResponse,
    @Body() body: unknown,
  ): Promise<void> {
    checkOrigin(request, this.settings.browserOrigin);
    requireJson(request);
    const { email, password } = registerInput(body);
    await this.identity.limit('register', source(request, this.settings.proxySecret), email);
    const proof = await this.identity.register(email, password, readToken(request, registrationCookie));
    this.setRegistration(response, proof);
  }

  @Post('auth/resend-verification')
  @HttpCode(202)
  async resendVerification(
    @Req() request: NodeRequest,
    @Res({ passthrough: true }) response: NodeResponse,
    @Body() body: unknown,
  ): Promise<void> {
    checkOrigin(request, this.settings.browserOrigin);
    requireJson(request);
    const email = emailInput(body);
    await this.identity.limit('resend-verification', source(request, this.settings.proxySecret), email);
    const proof = readToken(request, registrationCookie);
    await this.identity.resendVerification(email, proof);
    if (proof) {
      this.setRegistration(response, proof);
    }
  }

  @Post('auth/verify-email')
  @HttpCode(204)
  async verifyEmail(
    @Req() request: NodeRequest,
    @Res({ passthrough: true }) response: NodeResponse,
    @Body() body: unknown,
  ): Promise<void> {
    checkOrigin(request, this.settings.browserOrigin);
    requireJson(request);
    const token = tokenInput(body);
    await this.identity.limit('verify-email', source(request, this.settings.proxySecret));
    await this.identity.verifyEmail(token, readToken(request, registrationCookie));
    response.clearCookie(registrationCookie, this.cookieOptions('/api/v1/auth'));
  }

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Req() request: NodeRequest,
    @Res({ passthrough: true }) response: NodeResponse,
    @Body() body: unknown,
  ) {
    checkOrigin(request, this.settings.browserOrigin);
    requireJson(request);
    const { email, password } = loginInput(body);
    await this.identity.limit('login', source(request, this.settings.proxySecret), email);
    const session = await this.identity.login(email, password);
    this.setSession(response, session.token, session.expiresAt);
    return session.profile;
  }

  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() request: NodeRequest, @Res({ passthrough: true }) response: NodeResponse) {
    const session = await this.identity.refresh(mutationSession(request, this.settings.browserOrigin));
    this.setSession(response, session.token, session.expiresAt);
    return session.profile;
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() request: NodeRequest, @Res({ passthrough: true }) response: NodeResponse): Promise<void> {
    await this.identity.logout(mutationSession(request, this.settings.browserOrigin));
    response.clearCookie(sessionCookie, this.cookieOptions('/api/v1'));
  }

  @Post('auth/request-password-reset')
  @HttpCode(202)
  async requestPasswordReset(@Req() request: NodeRequest, @Body() body: unknown): Promise<void> {
    checkOrigin(request, this.settings.browserOrigin);
    requireJson(request);
    const email = emailInput(body);
    await this.identity.limit('request-password-reset', source(request, this.settings.proxySecret), email);
    await this.identity.requestPasswordReset(email);
  }

  @Post('auth/reset-password')
  @HttpCode(204)
  async resetPassword(@Req() request: NodeRequest, @Body() body: unknown): Promise<void> {
    checkOrigin(request, this.settings.browserOrigin);
    requireJson(request);
    const { token, password } = resetInput(body);
    await this.identity.limit('reset-password', source(request, this.settings.proxySecret));
    await this.identity.resetPassword(token, password);
  }

  @Get('me')
  getMe(@Req() request: NodeRequest) {
    return this.identity.getMe(requireSession(request));
  }

  @Patch('me')
  patchProfile(@Req() request: NodeRequest, @Body() body: unknown) {
    const token = mutationSession(request, this.settings.browserOrigin);
    requireJson(request);
    return this.identity.patchProfile(token, profileInput(body));
  }

  @Patch('me/avatar')
  chooseAvatar(@Req() request: NodeRequest, @Body() body: unknown) {
    const token = mutationSession(request, this.settings.browserOrigin);
    requireJson(request);
    return this.identity.chooseAvatar(token, avatarInput(body));
  }

  @Get('avatar-assets')
  avatarAssets() {
    return this.identity.avatarAssets();
  }

  @Get('users/:id')
  getPublicProfile(@Param('id') id: string) {
    return this.identity.getPublicProfile(uuid(id));
  }
}
