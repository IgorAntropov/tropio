CREATE TABLE draft_commands (
    actor_user_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('trip.create', 'trip.update', 'day.create', 'day.update', 'route.bind')),
    target_id uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    trip_id uuid NOT NULL REFERENCES trips (id),
    response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
    PRIMARY KEY (actor_user_id, action, target_id, idempotency_key)
);

CREATE INDEX draft_commands_trip_idx ON draft_commands (trip_id);

CREATE INDEX trips_active_owner_cursor_idx ON trips (owner_user_id, id) WHERE archived_at IS NULL;
