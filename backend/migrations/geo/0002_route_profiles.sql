ALTER TABLE tracks
    ADD COLUMN elevation_profile jsonb
    CHECK (elevation_profile IS NULL OR jsonb_typeof(elevation_profile) = 'object');
