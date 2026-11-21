CREATE TABLE trip_covers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES trips(id),
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 2097152),
    UNIQUE (trip_id, id)
);

REVOKE UPDATE ON trip_covers FROM tropio_travel_runtime;

ALTER TABLE trips
    ADD COLUMN cover_id uuid,
    ADD FOREIGN KEY (id, cover_id) REFERENCES trip_covers(trip_id, id);

ALTER TABLE trip_versions
    ADD COLUMN cover_id uuid,
    ADD FOREIGN KEY (trip_id, cover_id) REFERENCES trip_covers(trip_id, id);

CREATE INDEX trip_versions_cover_idx ON trip_versions(trip_id, cover_id) WHERE cover_id IS NOT NULL;

UPDATE draft_commands SET response = response || '{"cover_id": null}'::jsonb
    WHERE action <> 'trip.archive' AND NOT response ? 'cover_id';
