ALTER TABLE geo.route_hold_batches ADD COLUMN manifest_hash text
    CHECK (manifest_hash ~ '^[0-9a-f]{64}$');
