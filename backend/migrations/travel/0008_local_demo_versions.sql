CREATE TABLE local_demo_versions (
    version integer PRIMARY KEY CHECK (version > 0),
    filename text NOT NULL,
    checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    applied_at timestamptz
);

REVOKE UPDATE, DELETE ON local_demo_versions FROM tropio_travel_runtime;
GRANT UPDATE (applied_at) ON local_demo_versions TO tropio_travel_runtime;
