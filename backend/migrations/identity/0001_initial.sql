CREATE TABLE avatar_collections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL CHECK (btrim(code) <> ''),
    version integer NOT NULL CHECK (version > 0),
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    UNIQUE (code, version)
);

CREATE TABLE avatar_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id uuid NOT NULL REFERENCES avatar_collections (id),
    object_key text NOT NULL CHECK (btrim(object_key) <> ''),
    active boolean NOT NULL DEFAULT true,
    UNIQUE (collection_id, object_key)
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_normalized text UNIQUE,
    password_hash text,
    email_verified_at timestamptz,
    display_name text NOT NULL CHECK (btrim(display_name) <> ''),
    bio text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
    avatar_asset_id uuid REFERENCES avatar_assets (id),
    custom_avatar_object_key text CHECK (btrim(custom_avatar_object_key) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (email_normalized = lower(btrim(email_normalized)) AND email_normalized <> ''),
    CHECK (email_verified_at IS NULL OR email_normalized IS NOT NULL),
    CHECK (password_hash IS NULL OR (email_normalized IS NOT NULL AND btrim(password_hash) <> '')),
    CHECK (num_nonnulls(avatar_asset_id, custom_avatar_object_key) <= 1),
    CHECK (updated_at >= created_at)
);

CREATE INDEX users_avatar_asset_idx ON users (avatar_asset_id) WHERE avatar_asset_id IS NOT NULL;

CREATE TABLE auth_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id),
    provider text NOT NULL CHECK (btrim(provider) <> ''),
    provider_subject text NOT NULL CHECK (btrim(provider_subject) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_subject)
);

CREATE INDEX auth_identities_user_idx ON auth_identities (user_id);

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id),
    refresh_token_hash text NOT NULL UNIQUE CHECK (btrim(refresh_token_hash) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK (expires_at > created_at),
    CHECK (revoked_at >= created_at)
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE auth_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id),
    purpose text NOT NULL CHECK (purpose IN ('verify_email', 'change_email', 'reset_password')),
    token_hash text NOT NULL UNIQUE CHECK (btrim(token_hash) <> ''),
    target_email_normalized text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    CHECK (target_email_normalized = lower(btrim(target_email_normalized)) AND target_email_normalized <> ''),
    CHECK (purpose <> 'change_email' OR target_email_normalized IS NOT NULL),
    CHECK (expires_at > created_at),
    CHECK (consumed_at >= created_at AND consumed_at < expires_at)
);

CREATE INDEX auth_challenges_user_purpose_idx ON auth_challenges (user_id, purpose);

CREATE TABLE user_preferences (
    user_id uuid PRIMARY KEY REFERENCES users (id),
    privacy_settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(privacy_settings) = 'object')
);

CREATE TABLE user_roles (
    user_id uuid NOT NULL REFERENCES users (id),
    role_code text NOT NULL CHECK (btrim(role_code) <> ''),
    PRIMARY KEY (user_id, role_code)
);

CREATE TABLE user_consents (
    user_id uuid NOT NULL REFERENCES users (id),
    document_code text NOT NULL CHECK (btrim(document_code) <> ''),
    document_version text NOT NULL CHECK (btrim(document_version) <> ''),
    accepted_at timestamptz NOT NULL DEFAULT now(),
    withdrawn_at timestamptz,
    PRIMARY KEY (user_id, document_code, document_version),
    CHECK (withdrawn_at >= accepted_at)
);

INSERT INTO avatar_collections (id, code, version, status) VALUES
    ('a503628d-5b62-5f22-910a-21f7224f321a', 'default', 1, 'active');

INSERT INTO avatar_assets (id, collection_id, object_key) VALUES
    ('f7cbe6d3-4c13-55f6-951f-a0009613c54c', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_01.png'),
    ('4ee1e5c6-2cc0-5d10-bca6-2c25c6278c1e', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_02.png'),
    ('b3c241eb-f71d-5166-80af-0309b55addc5', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_03.png'),
    ('302a4612-e292-5882-b402-8c604ea865f6', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_04.png'),
    ('3b982a27-3f8b-5d67-9d59-a023d080988c', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_05.png'),
    ('40677143-b22f-5927-b098-a6020abebfab', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_06.png'),
    ('c6a767c3-8c31-5010-b539-96c67d5adb70', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_07.png'),
    ('284f32a3-131e-534c-af60-035b75303720', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_08.png'),
    ('593336b9-e4b9-56f4-854d-6dbc5918f54b', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_09.png'),
    ('82d7d5cc-4873-579b-a163-03cdab902582', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_10.png'),
    ('8e9f4bb2-ff5f-58c2-9876-fefc629e27fe', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_11.png'),
    ('79fc9a44-d0b4-55d5-8965-fea143000b8c', 'a503628d-5b62-5f22-910a-21f7224f321a', 'avatars/avatar_12.png');
