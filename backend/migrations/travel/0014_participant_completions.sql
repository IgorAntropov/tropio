ALTER TABLE trip_participants ADD UNIQUE (id, trip_id, user_id);

CREATE TABLE trip_completions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    participant_entry_id uuid NOT NULL,
    organizer_id uuid NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (trip_id, participant_id),
    FOREIGN KEY (participant_entry_id, trip_id, participant_id) REFERENCES trip_participants (id, trip_id, user_id)
);

CREATE INDEX trip_completions_personal_idx ON trip_completions (participant_id);
CREATE INDEX trip_completions_organizer_idx ON trip_completions (organizer_id, trip_id) WHERE organizer_id <> participant_id;
REVOKE UPDATE, DELETE ON trip_completions FROM tropio_travel_runtime;
