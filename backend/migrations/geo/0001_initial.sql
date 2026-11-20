CREATE FUNCTION is_wgs84_position(point_geom geometry)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
RETURN NOT ST_IsEmpty(point_geom)
    AND ST_X(point_geom) BETWEEN -180 AND 180
    AND ST_Y(point_geom) BETWEEN -90 AND 90;

CREATE FUNCTION is_wgs84_track(track_geom geometry)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
RETURN NOT ST_IsEmpty(track_geom)
    AND ST_NPoints(track_geom) >= 2
    AND ST_IsValid(track_geom)
    AND ST_XMin(track_geom) >= -180
    AND ST_XMax(track_geom) <= 180
    AND ST_YMin(track_geom) >= -90
    AND ST_YMax(track_geom) <= 90;

CREATE TABLE route_geometries (
    route_id uuid PRIMARY KEY,
    head_version bigint,
    head_sealed boolean GENERATED ALWAYS AS (true) STORED
);

CREATE TABLE route_geometry_versions (
    route_id uuid NOT NULL REFERENCES route_geometries (route_id),
    version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
    revision_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    parent_version bigint,
    status text NOT NULL CHECK (status IN ('ready', 'needs_rebuild')),
    distance_m double precision NOT NULL DEFAULT 0 CHECK (distance_m >= 0 AND distance_m < 'Infinity'),
    ascent_m double precision CHECK (ascent_m >= 0 AND ascent_m < 'Infinity'),
    descent_m double precision CHECK (descent_m >= 0 AND descent_m < 'Infinity'),
    created_at timestamptz NOT NULL DEFAULT now(),
    sealed_at timestamptz,
    sealed boolean GENERATED ALWAYS AS (sealed_at IS NOT NULL) STORED,
    PRIMARY KEY (route_id, version),
    UNIQUE (route_id, version, sealed),
    FOREIGN KEY (route_id, parent_version) REFERENCES route_geometry_versions (route_id, version),
    CHECK (parent_version < version)
);

ALTER TABLE route_geometries
    ADD CONSTRAINT route_head_version_fk
    FOREIGN KEY (route_id, head_version, head_sealed) REFERENCES route_geometry_versions (route_id, version, sealed);

CREATE TABLE poi_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (btrim(code) <> ''),
    label text NOT NULL CHECK (btrim(label) <> ''),
    active boolean NOT NULL DEFAULT true
);

CREATE TABLE pois (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id uuid NOT NULL,
    head_revision_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pois_author_idx ON pois (author_user_id, id);

CREATE TABLE poi_position_revisions (
    poi_id uuid NOT NULL REFERENCES pois (id),
    id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    geom geometry(Point, 4326) NOT NULL CHECK (is_wgs84_position(geom)),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (poi_id, id)
);

CREATE INDEX poi_position_revisions_geom_idx ON poi_position_revisions USING gist (geom);

CREATE TABLE poi_media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poi_id uuid NOT NULL REFERENCES pois (id),
    object_key text NOT NULL CHECK (btrim(object_key) <> ''),
    media_type text NOT NULL CHECK (btrim(media_type) <> ''),
    moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
    position integer NOT NULL CHECK (position >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (poi_id, id)
);

CREATE UNIQUE INDEX poi_media_active_position_idx ON poi_media (poi_id, position) WHERE deleted_at IS NULL;

CREATE TABLE poi_revisions (
    poi_id uuid NOT NULL REFERENCES pois (id),
    id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
    position_revision_id uuid NOT NULL,
    approved_position_revision_id uuid,
    category_id uuid NOT NULL REFERENCES poi_categories (id),
    name text NOT NULL CHECK (btrim(name) <> ''),
    description text,
    source text NOT NULL CHECK (btrim(source) <> ''),
    visibility text NOT NULL CHECK (visibility IN ('global', 'private', 'trip')),
    scope_trip_id uuid,
    moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
    primary_media_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (poi_id, id),
    UNIQUE (poi_id, version),
    FOREIGN KEY (poi_id, position_revision_id) REFERENCES poi_position_revisions (poi_id, id),
    FOREIGN KEY (poi_id, approved_position_revision_id) REFERENCES poi_position_revisions (poi_id, id),
    FOREIGN KEY (poi_id, primary_media_id) REFERENCES poi_media (poi_id, id),
    CHECK ((visibility = 'trip') = (scope_trip_id IS NOT NULL)),
    CHECK (
        (moderation_status = 'approved' AND approved_position_revision_id IS NOT DISTINCT FROM position_revision_id)
        OR (moderation_status IN ('pending', 'rejected') AND approved_position_revision_id IS NULL)
    )
);

ALTER TABLE pois
    ADD CONSTRAINT poi_head_revision_fk
    FOREIGN KEY (id, head_revision_id) REFERENCES poi_revisions (poi_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE poi_moderation_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poi_id uuid NOT NULL,
    poi_revision_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
    reason text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (poi_id, poi_revision_id) REFERENCES poi_revisions (poi_id, id),
    UNIQUE (poi_id, poi_revision_id)
);

CREATE TABLE trip_pois (
    trip_id uuid NOT NULL,
    poi_id uuid NOT NULL REFERENCES pois (id),
    added_by_user_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (trip_id, poi_id)
);

CREATE INDEX trip_pois_poi_idx ON trip_pois (poi_id, trip_id);

CREATE TABLE route_points (
    route_id uuid NOT NULL,
    route_version bigint NOT NULL,
    point_id uuid NOT NULL DEFAULT gen_random_uuid(),
    position integer NOT NULL CHECK (position >= 0),
    geom geometry(Point, 4326) NOT NULL CHECK (is_wgs84_position(geom)),
    requested_geom geometry(Point, 4326) CHECK (is_wgs84_position(requested_geom)),
    snapped_geom geometry(Point, 4326) CHECK (is_wgs84_position(snapped_geom)),
    name text,
    description text,
    point_type text NOT NULL CHECK (btrim(point_type) <> ''),
    poi_id uuid REFERENCES pois (id),
    schedule_start_date date,
    schedule_end_date date,
    schedule_start_time time,
    schedule_end_time time,
    schedule_timezone text CHECK (btrim(schedule_timezone) <> ''),
    PRIMARY KEY (route_id, route_version, point_id),
    UNIQUE (route_id, route_version, position),
    FOREIGN KEY (route_id, route_version) REFERENCES route_geometry_versions (route_id, version),
    CHECK (schedule_end_date IS NULL OR (schedule_start_date IS NOT NULL AND schedule_end_date >= schedule_start_date)),
    CHECK (schedule_end_time IS NULL OR schedule_start_time IS NOT NULL),
    CHECK (schedule_timezone IS NULL OR schedule_start_time IS NOT NULL)
);

CREATE TABLE tracks (
    route_id uuid NOT NULL,
    route_version bigint NOT NULL,
    track_id uuid NOT NULL DEFAULT gen_random_uuid(),
    position integer NOT NULL CHECK (position >= 0),
    start_point_id uuid NOT NULL,
    end_point_id uuid NOT NULL,
    geom geometry(LineString, 4326) NOT NULL CHECK (is_wgs84_track(geom)),
    build_mode text NOT NULL CHECK (build_mode IN ('automatic', 'straight')),
    transport_mode text NOT NULL CHECK (btrim(transport_mode) <> ''),
    status text NOT NULL CHECK (status IN ('ready', 'needs_rebuild')),
    name text,
    description text,
    difficulty text,
    distance_m double precision NOT NULL CHECK (distance_m >= 0 AND distance_m < 'Infinity'),
    estimated_duration_s integer CHECK (estimated_duration_s >= 0),
    ascent_m double precision CHECK (ascent_m >= 0 AND ascent_m < 'Infinity'),
    descent_m double precision CHECK (descent_m >= 0 AND descent_m < 'Infinity'),
    min_elevation_m double precision CHECK (min_elevation_m > '-Infinity' AND min_elevation_m < 'Infinity'),
    max_elevation_m double precision CHECK (max_elevation_m > '-Infinity' AND max_elevation_m < 'Infinity'),
    surface_override text,
    routing_provider text CHECK (btrim(routing_provider) <> ''),
    route_source_version text CHECK (btrim(route_source_version) <> ''),
    schedule_start_date date,
    schedule_end_date date,
    schedule_start_time time,
    schedule_end_time time,
    schedule_timezone text CHECK (btrim(schedule_timezone) <> ''),
    PRIMARY KEY (route_id, route_version, track_id),
    UNIQUE (route_id, route_version, position),
    FOREIGN KEY (route_id, route_version) REFERENCES route_geometry_versions (route_id, version),
    FOREIGN KEY (route_id, route_version, start_point_id) REFERENCES route_points (route_id, route_version, point_id),
    FOREIGN KEY (route_id, route_version, end_point_id) REFERENCES route_points (route_id, route_version, point_id),
    CHECK (start_point_id <> end_point_id),
    CHECK (max_elevation_m >= min_elevation_m),
    CHECK (build_mode <> 'automatic' OR status <> 'ready' OR (routing_provider IS NOT NULL AND route_source_version IS NOT NULL)),
    CHECK (schedule_end_date IS NULL OR (schedule_start_date IS NOT NULL AND schedule_end_date >= schedule_start_date)),
    CHECK (schedule_end_time IS NULL OR schedule_start_time IS NOT NULL),
    CHECK (schedule_timezone IS NULL OR schedule_start_time IS NOT NULL)
);

CREATE TABLE track_surfaces (
    route_id uuid NOT NULL,
    route_version bigint NOT NULL,
    track_id uuid NOT NULL,
    position integer NOT NULL CHECK (position >= 0),
    from_fraction numeric NOT NULL,
    to_fraction numeric NOT NULL,
    surface_type text NOT NULL CHECK (surface_type IN ('asphalt', 'gravel', 'dirt', 'forest', 'sand', 'rock', 'water', 'mixed', 'unknown')),
    source text NOT NULL CHECK (btrim(source) <> ''),
    PRIMARY KEY (route_id, route_version, track_id, position),
    FOREIGN KEY (route_id, route_version, track_id) REFERENCES tracks (route_id, route_version, track_id),
    CHECK (from_fraction >= 0 AND to_fraction <= 1 AND from_fraction < to_fraction)
);

CREATE TABLE route_poi_dependencies (
    route_id uuid NOT NULL,
    route_version bigint NOT NULL,
    poi_id uuid NOT NULL,
    position_revision_id uuid NOT NULL,
    PRIMARY KEY (route_id, route_version, poi_id, position_revision_id),
    FOREIGN KEY (route_id, route_version) REFERENCES route_geometry_versions (route_id, version),
    FOREIGN KEY (poi_id, position_revision_id) REFERENCES poi_position_revisions (poi_id, id)
);

CREATE INDEX route_poi_dependencies_reverse_idx
    ON route_poi_dependencies (poi_id, position_revision_id, route_id, route_version);

CREATE TABLE route_edit_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL CHECK (btrim(request_hash) <> ''),
    base_version bigint,
    result_version bigint NOT NULL,
    kind text NOT NULL CHECK (btrim(kind) <> ''),
    operation_details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(operation_details) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (route_id, actor_user_id, idempotency_key),
    UNIQUE (route_id, result_version),
    FOREIGN KEY (route_id, base_version) REFERENCES route_geometry_versions (route_id, version),
    FOREIGN KEY (route_id, result_version) REFERENCES route_geometry_versions (route_id, version),
    CHECK (base_version < result_version)
);

CREATE TABLE route_hold_batches (
    travel_operation_id uuid PRIMARY KEY,
    trip_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz,
    active boolean GENERATED ALWAYS AS (released_at IS NULL) STORED,
    UNIQUE (travel_operation_id, active),
    CHECK (released_at >= created_at)
);

CREATE TABLE route_geometry_holds (
    travel_operation_id uuid NOT NULL,
    route_id uuid NOT NULL,
    route_version bigint NOT NULL,
    batch_active boolean GENERATED ALWAYS AS (true) STORED,
    revision_sealed boolean GENERATED ALWAYS AS (true) STORED,
    PRIMARY KEY (travel_operation_id, route_id),
    FOREIGN KEY (travel_operation_id, batch_active) REFERENCES route_hold_batches (travel_operation_id, active),
    FOREIGN KEY (route_id, route_version, revision_sealed) REFERENCES route_geometry_versions (route_id, version, sealed)
);

CREATE INDEX route_geometry_holds_revision_idx ON route_geometry_holds (route_id, route_version);

CREATE TABLE route_hold_batch_pois (
    travel_operation_id uuid NOT NULL,
    poi_id uuid NOT NULL REFERENCES pois (id),
    batch_active boolean GENERATED ALWAYS AS (true) STORED,
    PRIMARY KEY (travel_operation_id, poi_id),
    FOREIGN KEY (travel_operation_id, batch_active) REFERENCES route_hold_batches (travel_operation_id, active)
);

CREATE TABLE outbox_events (
    event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id uuid NOT NULL,
    aggregate_version bigint NOT NULL,
    event_type text NOT NULL CHECK (event_type = 'route.track.split'),
    event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
    correlation_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    envelope bytea NOT NULL CHECK (octet_length(envelope) BETWEEN 1 AND 65536),
    published_at timestamptz,
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    revision_sealed boolean GENERATED ALWAYS AS (true) STORED,
    UNIQUE (aggregate_id, aggregate_version),
    FOREIGN KEY (aggregate_id, aggregate_version, revision_sealed) REFERENCES route_geometry_versions (route_id, version, sealed)
);

CREATE INDEX outbox_events_pending_idx
    ON outbox_events (aggregate_id, aggregate_version) WHERE published_at IS NULL;


CREATE FUNCTION guard_route_revision_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, geo
AS $$
BEGIN
    IF OLD.sealed_at IS NOT NULL THEN
        RAISE EXCEPTION 'A sealed route revision cannot be changed' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER route_revision_update_guard
    BEFORE UPDATE ON route_geometry_versions
    FOR EACH ROW EXECUTE FUNCTION guard_route_revision_update();

CREATE FUNCTION guard_route_revision_child_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, geo
AS $$
DECLARE
    parent_sealed_at timestamptz;
BEGIN
    SELECT sealed_at INTO parent_sealed_at
    FROM route_geometry_versions
    WHERE route_id = NEW.route_id AND version = NEW.route_version
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Route revision is missing' USING ERRCODE = '23503';
    END IF;
    IF parent_sealed_at IS NOT NULL THEN
        RAISE EXCEPTION 'A sealed route revision cannot accept new geometry' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER route_points_insert_guard
    BEFORE INSERT ON route_points
    FOR EACH ROW EXECUTE FUNCTION guard_route_revision_child_insert();

CREATE TRIGGER tracks_insert_guard
    BEFORE INSERT ON tracks
    FOR EACH ROW EXECUTE FUNCTION guard_route_revision_child_insert();

CREATE TRIGGER track_surfaces_insert_guard
    BEFORE INSERT ON track_surfaces
    FOR EACH ROW EXECUTE FUNCTION guard_route_revision_child_insert();

CREATE TRIGGER route_poi_dependencies_insert_guard
    BEFORE INSERT ON route_poi_dependencies
    FOR EACH ROW EXECUTE FUNCTION guard_route_revision_child_insert();

CREATE FUNCTION guard_route_hold_release()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, geo
AS $$
BEGIN
    IF OLD.released_at IS NOT NULL THEN
        RAISE EXCEPTION 'A released route hold batch cannot be changed' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER route_hold_release_guard
    BEFORE UPDATE ON route_hold_batches
    FOR EACH ROW EXECUTE FUNCTION guard_route_hold_release();

REVOKE UPDATE, DELETE ON
    route_geometry_versions,
    route_points,
    tracks,
    track_surfaces,
    route_poi_dependencies,
    route_edit_operations,
    poi_position_revisions,
    poi_revisions,
    poi_moderation_events,
    route_hold_batches,
    outbox_events
    FROM tropio_geo_runtime;

REVOKE UPDATE ON route_geometry_holds, route_hold_batch_pois FROM tropio_geo_runtime;

GRANT UPDATE (sealed_at) ON route_geometry_versions TO tropio_geo_runtime;
GRANT UPDATE (released_at) ON route_hold_batches TO tropio_geo_runtime;
GRANT UPDATE (published_at, attempt_count, next_attempt_at) ON outbox_events TO tropio_geo_runtime;
