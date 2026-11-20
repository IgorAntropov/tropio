CREATE TABLE trip_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES trips(id),
    applicant_user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (trip_id, applicant_user_id)
);
