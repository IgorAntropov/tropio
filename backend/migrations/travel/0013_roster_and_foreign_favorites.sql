DELETE FROM trip_favorites f USING trips t WHERE f.trip_id = t.id AND f.user_id = t.owner_user_id;

ALTER TABLE trip_applications
    DROP CONSTRAINT trip_applications_trip_id_applicant_user_id_key,
    DROP CONSTRAINT trip_applications_status_check,
    ADD CHECK (status IN ('pending', 'accepted', 'declined'));

CREATE UNIQUE INDEX trip_applications_active_applicant_idx
    ON trip_applications (trip_id, applicant_user_id) WHERE status = 'pending';

ALTER TABLE trip_participants
    DROP CONSTRAINT trip_participants_trip_id_user_id_key,
    DROP CONSTRAINT trip_participants_status_check,
    ADD CHECK (status IN ('confirmed', 'removed'));

CREATE UNIQUE INDEX trip_participants_active_user_idx
    ON trip_participants (trip_id, user_id) WHERE status = 'confirmed';
