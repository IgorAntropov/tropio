CREATE TABLE organizer_ratings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    trip_id uuid NOT NULL,
    stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (organizer_id <> participant_id),
    UNIQUE (organizer_id, participant_id)
);

CREATE TABLE friendships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    first_user_id uuid NOT NULL,
    second_user_id uuid NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    ended_at timestamptz,
    CHECK (first_user_id < second_user_id),
    CHECK (ended_at IS NULL OR ended_at >= confirmed_at)
);
CREATE UNIQUE INDEX friendships_active_pair_idx ON friendships (first_user_id, second_user_id) WHERE ended_at IS NULL;
CREATE INDEX friendships_first_user_idx ON friendships (first_user_id);
CREATE INDEX friendships_second_user_idx ON friendships (second_user_id);

CREATE TABLE earned_grades (
    user_id uuid NOT NULL,
    code text NOT NULL CHECK (btrim(code) <> ''),
    awarded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, code)
);

GRANT SELECT, INSERT ON organizer_ratings, earned_grades TO tropio_social_runtime;
GRANT SELECT, INSERT ON friendships TO tropio_social_runtime;
GRANT UPDATE (ended_at) ON friendships TO tropio_social_runtime;
