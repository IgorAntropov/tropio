import { Inject, Injectable, Logger } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { BffProblem } from '../http/bff-problem.js'
import { csrfToken, hashPassword, matchesPassword, randomToken, tokenHash } from './identity-crypto.js'
import { IdentityDatabase } from './identity-database.js'
import type { ProfilePatch } from './identity-input.js'
import { IDENTITY_SETTINGS } from './identity.config.js'
import type { IdentityMail, IdentityMailer, IdentitySettings } from './identity.config.js'

export const registrationLifetimeSeconds = 3600
const sessionLifetimeSeconds = 30 * 24 * 3600

type AuthFlow = 'register' | 'resend-verification' | 'verify-email' | 'login' | 'request-password-reset' | 'reset-password'

interface AvatarRow {
  id: string
  object_key: string
}

interface ProfileRow {
  id: string
  display_name: string
  bio: string | null
  avatar_id: string | null
  object_key: string | null
}

interface SessionRow extends ProfileRow {
  session_id: string
  expires_at: Date
}

interface LoginRow {
  id: string
  password_hash: string
}

interface RegistrationRow {
  email_normalized: string
  password_hash: string
  terms_version: string
  accepted_at: Date
}

function avatar(row: AvatarRow): { id: string; url: string } | null {
  if (!/^avatars\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(png|webp|avif)$/.test(row.object_key)) return null
  return { id: row.id, url: `/${row.object_key}` }
}

function profile(row: ProfileRow) {
  return {
    id: row.id,
    display_name: row.display_name,
    bio: row.bio,
    avatar: row.avatar_id && row.object_key ? avatar({ id: row.avatar_id, object_key: row.object_key }) : null,
  }
}

function privateProfile(row: ProfileRow, token: string) {
  return { ...profile(row), csrf_token: csrfToken(token) }
}

async function loadSession(client: PoolClient, token: string): Promise<SessionRow> {
  const { rows: [session] } = await client.query<SessionRow>(
    `SELECT u.id, u.display_name, u.bio, a.id AS avatar_id, a.object_key,
            s.id AS session_id, s.expires_at
     FROM identity.sessions s
     JOIN identity.users u ON u.id = s.user_id
     LEFT JOIN identity.avatar_assets a ON a.id = u.avatar_asset_id
     WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL
       AND s.expires_at > clock_timestamp() AND u.status = 'active' AND u.email_verified_at IS NOT NULL`,
    [tokenHash(token)],
  )
  if (!session) throw new BffProblem('SESSION_REQUIRED')
  return session
}

async function lockAccount(client: PoolClient, id: string): Promise<void> {
  await client.query('SELECT id FROM identity.users WHERE id = $1 FOR UPDATE', [id])
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name)

  constructor(
    @Inject(IdentityDatabase) private readonly database: IdentityDatabase,
    @Inject(IDENTITY_SETTINGS) private readonly settings: IdentitySettings,
  ) {}

  async limit(flow: AuthFlow, source: string, email?: string): Promise<void> {
    const entries = [
      { key: tokenHash(`${flow}:source:${source}`), limit: this.settings.rateLimit.source },
    ]
    if (email) entries.push({ key: tokenHash(`${flow}:email:${email}`), limit: this.settings.rateLimit.email })

    const retryAfter = await this.database.transaction(async (client) => {
      await client.query('DELETE FROM identity.auth_rate_windows WHERE expires_at <= now()')
      let retryAfter = 0
      for (const { key, limit } of entries) {
        const { rows: [result] } = await client.query<{ attempts: number; retry_after: number }>(
          `INSERT INTO identity.auth_rate_windows (key, attempts, expires_at)
           VALUES ($1, 1, now() + interval '10 minutes')
           ON CONFLICT (key) DO UPDATE
             SET attempts = CASE WHEN auth_rate_windows.expires_at <= now() THEN 1
                                 ELSE LEAST(auth_rate_windows.attempts + 1, 1000000) END,
                 expires_at = CASE WHEN auth_rate_windows.expires_at <= now() THEN EXCLUDED.expires_at
                                   ELSE auth_rate_windows.expires_at END
           RETURNING attempts, ceil(extract(epoch FROM expires_at - now()))::int AS retry_after`,
          [key],
        )
        if (result && result.attempts > limit) retryAfter = Math.max(retryAfter, result.retry_after)
      }
      return retryAfter
    })

    if (retryAfter > 0) throw new BffProblem('RATE_LIMITED', { retryAfter })
  }

  private get mailer() {
    if (!this.settings.mailer) throw new BffProblem('DEPENDENCY_UNAVAILABLE')
    return this.settings.mailer
  }

  private async sendMail(mailer: IdentityMailer, message: IdentityMail): Promise<void> {
    try {
      await mailer.send(message)
    } catch {
      this.logger.error('Identity could not enqueue a transactional email')
    }
  }

  async register(email: string, password: string, previousProof?: string): Promise<string> {
    const mailer = this.mailer
    const { termsVersion } = this.settings
    if (!termsVersion?.trim()) throw new BffProblem('DEPENDENCY_UNAVAILABLE')
    const proof = randomToken()
    const token = randomToken()
    const passwordHash = await hashPassword(password)

    const registered = await this.database.transaction(async (client) => {
      await client.query(
        'DELETE FROM identity.pending_registrations WHERE expires_at <= now() OR proof_hash = $1',
        [previousProof ? tokenHash(previousProof) : null],
      )
      const { rowCount } = await client.query(
        `INSERT INTO identity.pending_registrations
          (email_normalized, password_hash, terms_version, proof_hash, token_hash, expires_at)
         SELECT $1, $2, $3, $4, $5, now() + $6::integer * interval '1 second'
         WHERE NOT EXISTS (SELECT FROM identity.users WHERE email_normalized = $1)`,
        [email, passwordHash, termsVersion, tokenHash(proof), tokenHash(token), registrationLifetimeSeconds],
      )
      return rowCount === 1
    })

    if (registered) await this.sendMail(mailer, { kind: 'verify-email', email, token })
    return proof
  }

  async resendVerification(email: string, proof: string | undefined): Promise<void> {
    const mailer = this.mailer
    if (!proof) return
    const token = randomToken()

    const sentTo = await this.database.transaction(async (client) => {
      const { rows: [registration] } = await client.query<{ email_normalized: string }>(
        `UPDATE identity.pending_registrations
         SET token_hash = $1, expires_at = now() + $4::integer * interval '1 second'
         WHERE proof_hash = $2 AND email_normalized = $3 AND expires_at > clock_timestamp()
         RETURNING email_normalized`,
        [tokenHash(token), tokenHash(proof), email, registrationLifetimeSeconds],
      )
      return registration?.email_normalized
    })

    if (sentTo) await this.sendMail(mailer, { kind: 'verify-email', email: sentTo, token })
  }

  async verifyEmail(token: string, proof: string | undefined): Promise<void> {
    if (!proof) throw new BffProblem('INVALID_AUTH_TOKEN')

    await this.database.transaction(async (client) => {
      const { rows: [registration] } = await client.query<RegistrationRow>(
        `DELETE FROM identity.pending_registrations
         WHERE token_hash = $1 AND proof_hash = $2 AND expires_at > clock_timestamp()
         RETURNING email_normalized, password_hash, terms_version, accepted_at`,
        [tokenHash(token), tokenHash(proof)],
      )
      if (!registration) throw new BffProblem('INVALID_AUTH_TOKEN')

      const { rows: [assigned] } = await client.query<{ id: string }>(
        `SELECT a.id FROM identity.avatar_assets a
         JOIN identity.avatar_collections c ON c.id = a.collection_id
         WHERE a.active AND c.status = 'active'
         ORDER BY random() LIMIT 1 FOR SHARE OF a, c`,
      )
      if (!assigned) throw new BffProblem('DEPENDENCY_UNAVAILABLE')

      const { rows: [account] } = await client.query<{ id: string }>(
        `INSERT INTO identity.users
           (email_normalized, password_hash, email_verified_at, display_name, avatar_asset_id)
         VALUES ($1, $2, now(), 'Путешественник', $3)
         ON CONFLICT (email_normalized) DO NOTHING
         RETURNING id`,
        [registration.email_normalized, registration.password_hash, assigned.id],
      )
      if (account) {
        await client.query(
          `INSERT INTO identity.user_consents (user_id, document_code, document_version, accepted_at)
           VALUES ($1, 'terms', $2, $3)`,
          [account.id, registration.terms_version, registration.accepted_at],
        )
      }
    })
  }

  async login(email: string, password: string) {
    const account = await this.database.transaction(async (client) => {
      const { rows: [row] } = await client.query<LoginRow>(
        `SELECT id, password_hash FROM identity.users
         WHERE email_normalized = $1 AND status = 'active' AND email_verified_at IS NOT NULL
           AND password_hash IS NOT NULL`,
        [email],
      )
      return row
    })
    if (!await matchesPassword(password, account?.password_hash) || !account) {
      throw new BffProblem('INVALID_CREDENTIALS')
    }

    const token = randomToken()
    return this.database.transaction(async (client) => {
      await lockAccount(client, account.id)
      const { rowCount } = await client.query(
        `INSERT INTO identity.sessions (user_id, refresh_token_hash, expires_at)
         SELECT id, $3, now() + $4::integer * interval '1 second'
         FROM identity.users
         WHERE id = $1 AND password_hash = $2 AND status = 'active' AND email_verified_at IS NOT NULL`,
        [account.id, account.password_hash, tokenHash(token), sessionLifetimeSeconds],
      )
      if (!rowCount) throw new BffProblem('INVALID_CREDENTIALS')
      const session = await loadSession(client, token)
      return { token, expiresAt: session.expires_at, profile: privateProfile(session, token) }
    })
  }

  async canModeratePois(userId: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const { rowCount } = await client.query(
        `SELECT 1 FROM identity.user_roles r
         JOIN identity.users u ON u.id = r.user_id
         WHERE r.user_id = $1 AND r.role_code IN ('admin', 'poi_moderator')
           AND u.status = 'active' AND u.email_verified_at IS NOT NULL LIMIT 1`,
        [userId],
      )
      return rowCount === 1
    })
  }

  async authenticate(token: string): Promise<string> {
    return this.database.transaction(async (client) => (await loadSession(client, token)).id)
  }

  async getMe(token: string) {
    return this.database.transaction(async (client) => privateProfile(await loadSession(client, token), token))
  }

  private async mutateSession<T>(token: string, execute: (client: PoolClient, session: SessionRow) => Promise<T>): Promise<T> {
    return this.database.transaction(async (client) => {
      const previous = await loadSession(client, token)
      await lockAccount(client, previous.id)
      const session = await loadSession(client, token)
      return execute(client, session)
    })
  }

  async refresh(token: string) {
    const next = randomToken()
    return this.mutateSession(token, async (client, session) => {
      await client.query(
        'UPDATE identity.sessions SET refresh_token_hash = $1 WHERE id = $2',
        [tokenHash(next), session.session_id],
      )
      return { token: next, expiresAt: session.expires_at, profile: privateProfile(session, next) }
    })
  }

  async logout(token: string): Promise<void> {
    await this.mutateSession(token, async (client, session) => {
      await client.query('UPDATE identity.sessions SET revoked_at = now() WHERE id = $1', [session.session_id])
    })
  }

  async patchProfile(token: string, patch: ProfilePatch) {
    return this.mutateSession(token, async (client, session) => {
      await client.query(
        `UPDATE identity.users
         SET display_name = COALESCE($2, display_name),
             bio = CASE WHEN $3::boolean THEN $4 ELSE bio END, updated_at = clock_timestamp()
         WHERE id = $1`,
        [session.id, patch.displayName ?? null, patch.bio !== undefined, patch.bio ?? null],
      )
      return privateProfile(await loadSession(client, token), token)
    })
  }

  async chooseAvatar(token: string, avatarId: string) {
    return this.mutateSession(token, async (client, session) => {
      const { rowCount } = await client.query(
        `SELECT a.id FROM identity.avatar_assets a
         JOIN identity.avatar_collections c ON c.id = a.collection_id
         WHERE a.id = $1 AND a.active AND c.status = 'active'
         FOR SHARE OF a, c`,
        [avatarId],
      )
      if (!rowCount) throw new BffProblem('AVATAR_UNAVAILABLE')
      await client.query(
        `UPDATE identity.users SET avatar_asset_id = $2, custom_avatar_object_key = NULL,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [session.id, avatarId],
      )
      return privateProfile(await loadSession(client, token), token)
    })
  }

  async avatarAssets() {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<AvatarRow>(
        `SELECT a.id, a.object_key FROM identity.avatar_assets a
         JOIN identity.avatar_collections c ON c.id = a.collection_id
         WHERE a.active AND c.status = 'active'
         ORDER BY a.object_key, a.id`,
      )
      return { items: rows.map(avatar).filter((asset) => asset !== null) }
    })
  }

  async getPublicProfile(id: string) {
    return this.database.transaction(async (client) => {
      const { rows: [row] } = await client.query<ProfileRow>(
        `SELECT u.id, u.display_name,
                CASE WHEN p.privacy_settings->>'bio' = 'public' THEN u.bio END AS bio,
                a.id AS avatar_id, a.object_key
         FROM identity.users u
         LEFT JOIN identity.avatar_assets a ON a.id = u.avatar_asset_id
         LEFT JOIN identity.user_preferences p ON p.user_id = u.id
         WHERE u.id = $1 AND u.status = 'active' AND u.email_verified_at IS NOT NULL`,
        [id],
      )
      if (!row) throw new BffProblem('NOT_FOUND')
      return profile(row)
    })
  }

  async requestPasswordReset(email: string): Promise<void> {
    const mailer = this.mailer
    const token = randomToken()

    const sentTo = await this.database.transaction(async (client) => {
      const { rows: [row] } = await client.query<{ email_normalized: string }>(
        `INSERT INTO identity.auth_challenges (user_id, purpose, token_hash, target_email_normalized, expires_at)
         SELECT id, 'reset_password', $2, email_normalized, now() + interval '30 minutes'
         FROM identity.users
         WHERE email_normalized = $1 AND status = 'active' AND email_verified_at IS NOT NULL
           AND password_hash IS NOT NULL
         FOR UPDATE OF users
         RETURNING target_email_normalized AS email_normalized`,
        [email, tokenHash(token)],
      )
      return row?.email_normalized
    })

    if (sentTo) await this.sendMail(mailer, { kind: 'reset-password', email: sentTo, token })
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const hash = tokenHash(token)
    const passwordHash = await hashPassword(password)

    await this.database.transaction(async (client) => {
      const { rows: [initial] } = await client.query<{ user_id: string }>(
        `SELECT user_id FROM identity.auth_challenges
         WHERE token_hash = $1 AND purpose = 'reset_password' AND consumed_at IS NULL
           AND expires_at > clock_timestamp()`,
        [hash],
      )
      if (!initial) throw new BffProblem('INVALID_AUTH_TOKEN')
      await lockAccount(client, initial.user_id)

      const { rowCount } = await client.query(
        `UPDATE identity.users u SET password_hash = $1, updated_at = clock_timestamp()
         FROM identity.auth_challenges c
         WHERE c.user_id = u.id AND c.user_id = $2 AND c.token_hash = $3
           AND c.purpose = 'reset_password' AND c.consumed_at IS NULL
           AND c.expires_at > clock_timestamp() AND c.target_email_normalized = u.email_normalized
           AND u.status = 'active' AND u.email_verified_at IS NOT NULL`,
        [passwordHash, initial.user_id, hash],
      )
      if (!rowCount) throw new BffProblem('INVALID_AUTH_TOKEN')
      await client.query(
        'DELETE FROM identity.auth_challenges WHERE user_id = $1 AND purpose = $2',
        [initial.user_id, 'reset_password'],
      )
      await client.query(
        'UPDATE identity.sessions SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL',
        [initial.user_id],
      )
    })
  }
}
