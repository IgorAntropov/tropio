CREATE TABLE pending_registrations (
    proof_hash text PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    email_normalized text NOT NULL CHECK (email_normalized = lower(btrim(email_normalized)) AND email_normalized <> ''),
    password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
    terms_version text NOT NULL CHECK (btrim(terms_version) <> ''),
    accepted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > accepted_at)
);

CREATE INDEX pending_registrations_expiry_idx ON pending_registrations (expires_at);

CREATE TABLE auth_rate_windows (
    key text PRIMARY KEY,
    attempts integer NOT NULL CHECK (attempts > 0),
    expires_at timestamptz NOT NULL
);

CREATE INDEX auth_rate_windows_expiry_idx ON auth_rate_windows (expires_at);
