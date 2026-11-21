CREATE TABLE trip_favorites (
    user_id uuid NOT NULL,
    trip_id uuid NOT NULL REFERENCES trips(id),
    PRIMARY KEY (user_id, trip_id)
);

CREATE INDEX trip_applications_applicant_cursor_idx ON trip_applications (applicant_user_id, trip_id) WHERE status = 'pending';
CREATE INDEX trip_participants_user_cursor_idx ON trip_participants (user_id, trip_id) WHERE status = 'confirmed';
