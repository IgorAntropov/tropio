CREATE TABLE trips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    title text NOT NULL CHECK (btrim(title) <> ''),
    description text,
    difficulty text,
    participation_rules text,
    lifecycle text NOT NULL DEFAULT 'planned' CHECK (lifecycle IN ('planned', 'in_progress', 'completed', 'cancelled')),
    visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
    archived_at timestamptz,
    timezone text CHECK (btrim(timezone) <> ''),
    start_date date,
    end_date date,
    cover_object_key text CHECK (btrim(cover_object_key) <> ''),
    first_route_ready_at timestamptz,
    free_capacity integer CHECK (free_capacity > 0),
    trip_revision_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
    publication_id uuid,
    access_generation bigint NOT NULL DEFAULT 0 CHECK (access_generation >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, publication_id),
    CHECK (isfinite(start_date) AND isfinite(end_date)),
    CHECK (end_date IS NULL OR (start_date IS NOT NULL AND end_date >= start_date)),
    CHECK (publication_id IS NULL OR (visibility = 'public' AND archived_at IS NULL)),
    CHECK (updated_at >= created_at)
);

CREATE INDEX trips_owner_idx ON trips (owner_user_id);

CREATE TABLE trip_days (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES trips (id),
    position integer NOT NULL CHECK (position > 0),
    local_date date CHECK (isfinite(local_date)),
    description text,
    notes text,
    archived_at timestamptz,
    UNIQUE (trip_id, id)
);

CREATE UNIQUE INDEX trip_days_active_position_idx ON trip_days (trip_id, position) WHERE archived_at IS NULL;

CREATE TABLE routes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL,
    trip_day_id uuid NOT NULL UNIQUE,
    title text,
    geometry_status text NOT NULL DEFAULT 'empty' CHECK (geometry_status IN ('empty', 'ready', 'needs_rebuild')),
    archived_at timestamptz,
    UNIQUE (trip_id, trip_day_id, id),
    FOREIGN KEY (trip_id, trip_day_id) REFERENCES trip_days (trip_id, id)
);

CREATE TABLE trip_equipment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES trips (id),
    position integer NOT NULL CHECK (position > 0),
    label text NOT NULL CHECK (btrim(label) <> ''),
    required boolean NOT NULL DEFAULT true,
    UNIQUE (trip_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE trip_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES trips (id),
    actor_user_id uuid,
    action text NOT NULL CHECK (btrim(action) <> ''),
    object_id uuid,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trip_audit_events_trip_idx ON trip_audit_events (trip_id, occurred_at);

CREATE TABLE route_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES trips (id),
    initiator_user_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('publish', 'unpublish')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
    expected_trip_revision_id uuid NOT NULL,
    expected_publication_id uuid,
    idempotency_key uuid NOT NULL,
    request_fingerprint text NOT NULL CHECK (btrim(request_fingerprint) <> ''),
    result_trip_revision_id uuid,
    error_code text CHECK (btrim(error_code) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    deadline_at timestamptz,
    manifest_sealed_at timestamptz,
    finished_at timestamptz,
    prepare_attempt_count integer NOT NULL DEFAULT 0 CHECK (prepare_attempt_count >= 0),
    prepare_next_attempt_at timestamptz NOT NULL DEFAULT now(),
    release_requested_at timestamptz,
    release_acknowledged_at timestamptz,
    release_attempt_count integer NOT NULL DEFAULT 0 CHECK (release_attempt_count >= 0),
    release_next_attempt_at timestamptz,
    UNIQUE (trip_id, id),
    UNIQUE (trip_id, initiator_user_id, kind, idempotency_key),
    CHECK ((kind = 'publish') = (deadline_at IS NOT NULL)),
    CHECK (deadline_at > created_at),
    CHECK (manifest_sealed_at IS NULL OR (kind = 'publish' AND manifest_sealed_at >= created_at AND manifest_sealed_at < deadline_at)),
    CHECK (finished_at >= created_at),
    CHECK ((status = 'pending') = (finished_at IS NULL)),
    CHECK ((status = 'succeeded') = (result_trip_revision_id IS NOT NULL)),
    CHECK (kind <> 'publish' OR status <> 'succeeded'
        OR (manifest_sealed_at IS NOT NULL AND finished_at >= manifest_sealed_at AND finished_at < deadline_at)),
    CHECK ((status = 'failed') = (error_code IS NOT NULL)),
    CHECK ((kind = 'publish' AND status = 'failed') = (release_requested_at IS NOT NULL)),
    CHECK (release_requested_at >= finished_at),
    CHECK (release_requested_at IS NOT NULL OR release_acknowledged_at IS NULL),
    CHECK (release_acknowledged_at >= release_requested_at),
    CHECK ((release_requested_at IS NOT NULL AND release_acknowledged_at IS NULL) = (release_next_attempt_at IS NOT NULL)),
    CHECK (release_next_attempt_at >= release_requested_at)
);

CREATE INDEX route_operations_pending_idx ON route_operations (prepare_next_attempt_at, id)
    WHERE kind = 'publish' AND status = 'pending';

CREATE INDEX route_operations_release_idx ON route_operations (release_next_attempt_at, id)
    WHERE release_requested_at IS NOT NULL AND release_acknowledged_at IS NULL;

CREATE TABLE route_operation_routes (
    trip_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    day_id uuid NOT NULL,
    route_id uuid NOT NULL,
    route_revision_id uuid NOT NULL,
    day_position integer NOT NULL CHECK (day_position > 0),
    PRIMARY KEY (operation_id, route_id),
    UNIQUE (operation_id, day_position),
    FOREIGN KEY (trip_id, operation_id) REFERENCES route_operations (trip_id, id),
    FOREIGN KEY (trip_id, day_id, route_id) REFERENCES routes (trip_id, trip_day_id, id)
);

CREATE TABLE route_operation_pois (
    trip_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    poi_id uuid NOT NULL,
    PRIMARY KEY (operation_id, poi_id),
    FOREIGN KEY (trip_id, operation_id) REFERENCES route_operations (trip_id, id)
);

CREATE FUNCTION guard_sealed_operation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, travel
AS $guard$
BEGIN
    IF OLD.manifest_sealed_at IS NOT NULL AND ROW(
        NEW.id, NEW.trip_id, NEW.initiator_user_id, NEW.kind, NEW.expected_trip_revision_id,
        NEW.expected_publication_id, NEW.idempotency_key, NEW.request_fingerprint, NEW.deadline_at,
        NEW.manifest_sealed_at
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.trip_id, OLD.initiator_user_id, OLD.kind, OLD.expected_trip_revision_id,
        OLD.expected_publication_id, OLD.idempotency_key, OLD.request_fingerprint, OLD.deadline_at,
        OLD.manifest_sealed_at
    ) THEN
        RAISE EXCEPTION 'A sealed publication operation cannot change its manifest' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'pending' AND ROW(NEW.status, NEW.finished_at, NEW.result_trip_revision_id, NEW.error_code)
        IS DISTINCT FROM ROW(OLD.status, OLD.finished_at, OLD.result_trip_revision_id, OLD.error_code) THEN
        RAISE EXCEPTION 'A finished publication operation cannot change its status' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$guard$;

CREATE TRIGGER route_operation_manifest_guard
    BEFORE UPDATE ON route_operations
    FOR EACH ROW EXECUTE FUNCTION guard_sealed_operation();

CREATE FUNCTION require_open_operation_manifest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, travel
AS $guard$
BEGIN
    PERFORM 1 FROM route_operations
    WHERE id = NEW.operation_id AND trip_id = NEW.trip_id AND kind = 'publish'
        AND status = 'pending' AND manifest_sealed_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Publication manifest is missing, sealed, or finished' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$guard$;

CREATE TRIGGER route_operation_routes_manifest_guard
    BEFORE INSERT ON route_operation_routes
    FOR EACH ROW EXECUTE FUNCTION require_open_operation_manifest();

CREATE TRIGGER route_operation_pois_manifest_guard
    BEFORE INSERT ON route_operation_pois
    FOR EACH ROW EXECUTE FUNCTION require_open_operation_manifest();

CREATE TABLE trip_versions (
    publication_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES trips (id),
    trip_version bigint NOT NULL CHECK (trip_version BETWEEN 1 AND 9007199254740991),
    operation_id uuid NOT NULL UNIQUE,
    snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    snapshot_schema_version integer NOT NULL DEFAULT 1 CHECK (snapshot_schema_version > 0),
    meeting_at timestamptz,
    meeting_timezone text CHECK (btrim(meeting_timezone) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (trip_id, publication_id),
    UNIQUE (trip_id, trip_version),
    FOREIGN KEY (trip_id, operation_id) REFERENCES route_operations (trip_id, id),
    CHECK ((meeting_at IS NULL) = (meeting_timezone IS NULL))
);

CREATE FUNCTION require_sealed_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, travel
AS $guard$
BEGIN
    PERFORM 1 FROM route_operations
    WHERE id = NEW.operation_id AND trip_id = NEW.trip_id AND kind = 'publish'
        AND status = 'succeeded' AND manifest_sealed_at IS NOT NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Publication snapshot requires a successful sealed operation' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$guard$;

CREATE TRIGGER trip_versions_operation_guard
    BEFORE INSERT ON trip_versions
    FOR EACH ROW EXECUTE FUNCTION require_sealed_publication();

REVOKE UPDATE, DELETE ON route_operation_routes, route_operation_pois, trip_versions
    FROM tropio_travel_runtime;

CREATE VIEW trip_version_routes AS
SELECT
    versions.trip_id,
    versions.publication_id,
    operation_routes.day_id,
    operation_routes.route_id,
    operation_routes.route_revision_id,
    operation_routes.day_position
FROM trip_versions AS versions
JOIN route_operation_routes AS operation_routes
    ON operation_routes.operation_id = versions.operation_id;

CREATE VIEW trip_version_pois AS
SELECT versions.trip_id, versions.publication_id, operation_pois.poi_id
FROM trip_versions AS versions
JOIN route_operation_pois AS operation_pois
    ON operation_pois.operation_id = versions.operation_id;

ALTER TABLE route_operations
    ADD FOREIGN KEY (trip_id, expected_publication_id) REFERENCES trip_versions (trip_id, publication_id);

ALTER TABLE trips
    ADD FOREIGN KEY (id, publication_id) REFERENCES trip_versions (trip_id, publication_id);

CREATE TABLE trip_catalog_entries (
    trip_id uuid PRIMARY KEY,
    publication_id uuid NOT NULL,
    start_geog geography(Point, 4326) CHECK (NOT ST_IsEmpty(start_geog::geometry)),
    search_text text NOT NULL,
    first_local_date date CHECK (isfinite(first_local_date)),
    trip_type text,
    difficulty text,
    FOREIGN KEY (trip_id, publication_id) REFERENCES trips (id, publication_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX trip_catalog_entries_start_geog_idx ON trip_catalog_entries USING gist (start_geog);

CREATE TABLE outbox_events (
    event_id uuid PRIMARY KEY,
    aggregate_id uuid NOT NULL REFERENCES trips (id),
    aggregate_version bigint NOT NULL CHECK (aggregate_version BETWEEN 1 AND 9007199254740991),
    event_type text NOT NULL CHECK (event_type IN ('trip.published', 'trip.unpublished')),
    event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
    correlation_id uuid NOT NULL,
    occurred_at timestamptz(3) NOT NULL DEFAULT now(),
    envelope bytea NOT NULL CHECK (octet_length(envelope) BETWEEN 1 AND 65536),
    published_at timestamptz,
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (aggregate_id, aggregate_version)
);

CREATE INDEX outbox_events_pending_idx ON outbox_events (aggregate_id, aggregate_version)
    WHERE published_at IS NULL;

REVOKE UPDATE, DELETE ON outbox_events FROM tropio_travel_runtime;
GRANT UPDATE (published_at, attempt_count, next_attempt_at) ON outbox_events TO tropio_travel_runtime;
