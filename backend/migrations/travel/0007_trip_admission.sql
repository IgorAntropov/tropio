ALTER TABLE trips ADD COLUMN admission_mode text NOT NULL DEFAULT 'request'
    CHECK (admission_mode IN ('request', 'open'));

UPDATE draft_commands SET response = jsonb_set(response, '{admission_mode}', '"request"')
    WHERE action <> 'trip.archive' AND NOT response ? 'admission_mode';

ALTER TABLE trip_applications
    DROP CONSTRAINT trip_applications_status_check,
    ADD COLUMN decided_at timestamptz,
    ADD CHECK (status IN ('pending', 'accepted')),
    ADD CHECK ((status = 'pending') = (decided_at IS NULL)),
    ADD CHECK (decided_at >= created_at);

CREATE TABLE trip_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES trips(id),
    user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'confirmed' CHECK (status = 'confirmed'),
    joined_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (trip_id, user_id)
);
