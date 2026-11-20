DO $contract$
DECLARE
    service text;
    runtime text;
    other_service text;
    domain_table text;
BEGIN
    IF to_regtype('public.geometry') IS NULL THEN
        RAISE EXCEPTION 'PostGIS geometry is unavailable';
    END IF;

    FOREACH service IN ARRAY ARRAY['identity', 'travel', 'geo'] LOOP
        runtime := format('tropio_%s_runtime', service);
        domain_table := CASE service
            WHEN 'identity' THEN 'users'
            WHEN 'travel' THEN 'trips'
            ELSE 'route_geometries'
        END;

        IF NOT has_schema_privilege(runtime, service, 'USAGE')
            OR has_schema_privilege(runtime, service, 'CREATE')
            OR NOT has_table_privilege(runtime, format('%I.%I', service, domain_table), 'SELECT')
            OR NOT has_table_privilege(runtime, format('%I.%I', service, domain_table), 'INSERT')
            OR has_schema_privilege(runtime, 'tropio_migrations', 'USAGE')
        THEN
            RAISE EXCEPTION 'Unexpected domain or migration grants for %', runtime;
        END IF;

        FOREACH other_service IN ARRAY ARRAY['identity', 'travel', 'geo'] LOOP
            IF service <> other_service AND (
                has_schema_privilege(runtime, other_service, 'USAGE')
                OR has_schema_privilege(format('tropio_%s_owner', service), other_service, 'USAGE')
            ) THEN
                RAISE EXCEPTION 'Cross-service schema privileges for % on %', service, other_service;
            END IF;
        END LOOP;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_namespace AS n
            JOIN pg_roles AS r ON r.oid = n.nspowner
            WHERE n.nspname = service AND r.rolname = format('tropio_%s_owner', service)
        ) THEN
            RAISE EXCEPTION 'Unexpected schema owner for %', service;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS child ON child.oid = constraint_row.conrelid
        JOIN pg_namespace AS child_schema ON child_schema.oid = child.relnamespace
        JOIN pg_class AS parent ON parent.oid = constraint_row.confrelid
        WHERE constraint_row.contype = 'f'
            AND child_schema.nspname IN ('identity', 'travel', 'geo')
            AND child.relnamespace <> parent.relnamespace
    ) THEN
        RAISE EXCEPTION 'A domain foreign key crosses service schemas';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM geometry_columns
        WHERE f_table_schema = 'geo' AND f_table_name = 'tracks'
            AND f_geometry_column = 'geom' AND type = 'LINESTRING' AND srid = 4326
    ) THEN
        RAISE EXCEPTION 'Track geometry does not match the GIS contract';
    END IF;
END;
$contract$;

SET LOCAL ROLE tropio_identity_runtime;

DO $$
DECLARE
    active_avatar uuid;
BEGIN
    IF (SELECT count(*)
        FROM identity.avatar_assets assets
        JOIN identity.avatar_collections collections ON collections.id = assets.collection_id
        WHERE assets.active AND collections.status = 'active') <> 12 THEN
        RAISE EXCEPTION 'Identity assets are incomplete';
    END IF;

    SELECT id INTO STRICT active_avatar FROM identity.avatar_assets WHERE object_key = 'avatars/avatar_01.png';
    INSERT INTO identity.users (display_name, email_normalized, avatar_asset_id)
    VALUES ('Test', 'test@example.test', active_avatar);
    INSERT INTO identity.users (display_name) VALUES ('OAuth profile 1'), ('OAuth profile 2');

    BEGIN
        INSERT INTO identity.users (display_name, email_normalized) VALUES ('Duplicate', 'test@example.test');
        RAISE EXCEPTION 'Expected a duplicate email rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO identity.users (display_name, avatar_asset_id, custom_avatar_object_key)
        VALUES ('Both avatars', active_avatar, 'custom/avatar.png');
        RAISE EXCEPTION 'Expected avatar reference exclusivity';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END
$$;

RESET ROLE;
SET LOCAL ROLE tropio_travel_runtime;

DO $$
DECLARE
    owner_id uuid := gen_random_uuid();
    trip uuid := gen_random_uuid();
    other_trip uuid := gen_random_uuid();
    day uuid := gen_random_uuid();
    other_day uuid := gen_random_uuid();
    route uuid := gen_random_uuid();
    revision uuid := gen_random_uuid();
    previous_draft uuid := gen_random_uuid();
    next_draft uuid := gen_random_uuid();
    operation uuid := gen_random_uuid();
    idem_key uuid := gen_random_uuid();
    publication uuid := gen_random_uuid();
    previous_publication uuid := gen_random_uuid();
    event_bytes bytea := convert_to('{"test": true}', 'UTF8');
BEGIN
    INSERT INTO travel.trips (id, owner_user_id, created_by_user_id, title, start_date, end_date, visibility, trip_revision_id)
    VALUES
        (trip, owner_id, owner_id, 'Test Trip', '2026-12-31', '2027-01-01', 'public', previous_draft),
        (other_trip, owner_id, owner_id, 'Other Trip', NULL, NULL, 'private', gen_random_uuid());
    INSERT INTO travel.trip_days (id, trip_id, position) VALUES (day, trip, 1), (other_day, other_trip, 1);
    INSERT INTO travel.routes (id, trip_id, trip_day_id) VALUES (route, trip, day);

    BEGIN
        INSERT INTO travel.routes (trip_id, trip_day_id) VALUES (trip, other_day);
        RAISE EXCEPTION 'Expected a cross-trip route rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    INSERT INTO travel.route_operations (
        id, trip_id, initiator_user_id, kind, expected_trip_revision_id, idempotency_key, request_fingerprint, deadline_at)
    VALUES (operation, trip, owner_id, 'publish', previous_draft, idem_key, 'test', now() + interval '1 minute');

    BEGIN
        INSERT INTO travel.route_operations (
            trip_id, initiator_user_id, kind, expected_trip_revision_id, idempotency_key, request_fingerprint, deadline_at)
        VALUES (trip, owner_id, 'publish', previous_draft, idem_key, 'retry', now() + interval '1 minute');
        RAISE EXCEPTION 'Expected an idempotency uniqueness rejection';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    INSERT INTO travel.route_operations (
        trip_id, initiator_user_id, kind, expected_trip_revision_id, idempotency_key, request_fingerprint)
    VALUES (trip, owner_id, 'unpublish', previous_draft, idem_key, 'separate scope');

    INSERT INTO travel.route_operation_routes (trip_id, operation_id, day_id, route_id, route_revision_id, day_position)
    VALUES (trip, operation, day, route, revision, 1);
    INSERT INTO travel.route_operation_pois (trip_id, operation_id, poi_id) VALUES (trip, operation, gen_random_uuid());

    UPDATE travel.route_operations SET manifest_sealed_at = now() WHERE id = operation;
    BEGIN
        INSERT INTO travel.route_operation_pois (trip_id, operation_id, poi_id)
        VALUES (trip, operation, gen_random_uuid());
        RAISE EXCEPTION 'Expected sealed manifest to reject a late POI';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE travel.route_operations
    SET status = 'succeeded', result_trip_revision_id = next_draft, finished_at = now()
    WHERE id = operation;

    INSERT INTO travel.trip_versions (publication_id, trip_id, trip_version, operation_id, snapshot, meeting_at, meeting_timezone)
    VALUES (publication, trip, 2, operation, '{"days":[]}', '2026-12-31T02:00:00Z', 'Asia/Tomsk');

    UPDATE travel.trips SET publication_id = publication, trip_revision_id = next_draft, version = 2, access_generation = 1
    WHERE id = trip;

    IF NOT EXISTS (
        SELECT 1 FROM travel.trip_version_routes WHERE publication_id = publication AND route_id = route AND route_revision_id = revision
    ) THEN
        RAISE EXCEPTION 'Published snapshot lost its exact Geo revision';
    END IF;

    IF (SELECT count(*) FROM travel.trip_version_pois WHERE publication_id = publication) <> 1 THEN
        RAISE EXCEPTION 'Published snapshot lost its selected POI';
    END IF;

    BEGIN
        UPDATE travel.route_operation_routes SET route_revision_id = gen_random_uuid() WHERE operation_id = operation;
        RAISE EXCEPTION 'Expected the published manifest to reject revision replacement';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    INSERT INTO travel.trip_catalog_entries (trip_id, publication_id, search_text)
    VALUES (trip, publication, 'Test Trip');

    BEGIN
        UPDATE travel.trip_catalog_entries SET publication_id = previous_publication WHERE trip_id = trip;
        SET CONSTRAINTS ALL IMMEDIATE;
        RAISE EXCEPTION 'Expected a stale catalog pointer rejection';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    INSERT INTO travel.outbox_events (event_id, aggregate_id, aggregate_version, event_type, correlation_id, envelope)
    VALUES (gen_random_uuid(), trip, 2, 'trip.published', operation, event_bytes);

    IF NOT EXISTS (
        SELECT 1 FROM travel.outbox_events WHERE aggregate_id = trip AND aggregate_version = 2 AND envelope = event_bytes
    ) THEN
        RAISE EXCEPTION 'Outbox failed to retain the serialized bytes';
    END IF;

    UPDATE travel.outbox_events SET attempt_count = 1 WHERE aggregate_id = trip;
    BEGIN
        UPDATE travel.outbox_events SET envelope = convert_to('{}', 'UTF8') WHERE aggregate_id = trip;
        RAISE EXCEPTION 'Allowed the delivery attempt to change the event envelope';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    UPDATE travel.trips SET publication_id = NULL, visibility = 'private' WHERE id = trip;
    DELETE FROM travel.trip_catalog_entries WHERE trip_id = trip;
    SET CONSTRAINTS ALL IMMEDIATE;
END
$$;

RESET ROLE;

SET LOCAL ROLE tropio_geo_runtime;
SET LOCAL search_path TO geo, public;
SET CONSTRAINTS poi_head_revision_fk DEFERRED;
DO $$
DECLARE
    owner uuid := gen_random_uuid();
    category uuid := (SELECT id FROM poi_categories WHERE code = 'viewpoint');
    place uuid := gen_random_uuid();
    place_revision uuid := gen_random_uuid();
    place_position uuid := gen_random_uuid();
    old_position uuid := gen_random_uuid();
    route uuid := gen_random_uuid();
    first_point uuid := gen_random_uuid();
    last_point uuid := gen_random_uuid();
    next_point uuid := gen_random_uuid();
    operation uuid := gen_random_uuid();
    late_operation uuid := gen_random_uuid();
    trip uuid := gen_random_uuid();
BEGIN
    BEGIN
        UPDATE poi_categories SET label = 'POI Test' WHERE id = category;
        RAISE EXCEPTION 'Allowed runtime edits to a system POI category';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    INSERT INTO pois (id, author_user_id, head_revision_id) VALUES (place, owner, place_revision);
    INSERT INTO poi_position_revisions (poi_id, id, geom)
    VALUES
        (place, place_position, ST_SetSRID(ST_MakePoint(84, 56), 4326)),
        (place, old_position, ST_SetSRID(ST_MakePoint(85, 57), 4326));
    BEGIN
        INSERT INTO poi_revisions (
            poi_id, id, category_id, version, position_revision_id, approved_position_revision_id, name, source, visibility, moderation_status
        ) VALUES (place, place_revision, category, 1, place_position, old_position, 'Test', 'manual', 'global', 'approved');
        RAISE EXCEPTION 'Accepted approval from a different position revision';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    INSERT INTO poi_revisions (
        poi_id, id, category_id, version, position_revision_id, approved_position_revision_id, name, source, visibility, moderation_status
    ) VALUES (place, place_revision, category, 1, place_position, place_position, 'Test', 'manual', 'global', 'approved');
    SET CONSTRAINTS ALL IMMEDIATE;

    BEGIN
        UPDATE poi_position_revisions SET geom = ST_SetSRID(ST_MakePoint(86, 58), 4326)
        WHERE poi_id = place AND id = place_position;
        RAISE EXCEPTION 'Allowed coordinates to change behind an approved position UUID';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    INSERT INTO route_geometries (route_id) VALUES (route);
    INSERT INTO route_geometry_versions (route_id, version, status) VALUES (route, 1, 'ready');
    BEGIN
        UPDATE route_geometries SET head_version = 1 WHERE route_id = route;
        RAISE EXCEPTION 'Allowed an unsealed revision to become the route head';
    EXCEPTION WHEN check_violation OR foreign_key_violation THEN
        NULL;
    END;
    INSERT INTO route_points (route_id, route_version, point_id, position, geom, point_type)
    VALUES
        (route, 1, first_point, 0, ST_SetSRID(ST_MakePoint(84, 56), 4326), 'start'),
        (route, 1, last_point, 1, ST_SetSRID(ST_MakePoint(85, 57), 4326), 'end');

    INSERT INTO tracks (route_id, route_version, position, start_point_id, end_point_id, geom, build_mode, transport_mode, status, distance_m)
    VALUES (route, 1, 0, first_point, last_point, ST_GeomFromText('LINESTRING(84 56,85 57)', 4326), 'straight', 'foot', 'ready', 100);
    INSERT INTO route_poi_dependencies VALUES (route, 1, place, place_position);

    UPDATE route_geometry_versions SET sealed_at = now() WHERE route_id = route AND version = 1;
    UPDATE route_geometries SET head_version = 1 WHERE route_id = route;
    BEGIN
        INSERT INTO route_points (route_id, route_version, position, geom, point_type)
        VALUES (route, 1, 2, ST_SetSRID(ST_MakePoint(86, 58), 4326), 'end');
        RAISE EXCEPTION 'Allowed a late point in a sealed route revision';
    EXCEPTION WHEN check_violation OR foreign_key_violation THEN
        NULL;
    END;

    INSERT INTO route_geometry_versions (route_id, version, parent_version, status) VALUES (route, 2, 1, 'ready');
    INSERT INTO route_points (route_id, route_version, point_id, position, geom, point_type)
    VALUES (route, 2, next_point, 0, ST_SetSRID(ST_MakePoint(85, 57), 4326), 'start');
    BEGIN
        INSERT INTO tracks (route_id, route_version, position, start_point_id, end_point_id, geom, build_mode, transport_mode, status, distance_m)
        VALUES (route, 2, 0, next_point, last_point, ST_GeomFromText('LINESTRING(85 57,84 56)', 4326), 'straight', 'foot', 'ready', 100);
        RAISE EXCEPTION 'Accepted endpoint from a different route revision';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    INSERT INTO route_hold_batches (travel_operation_id, trip_id, released_at) VALUES (late_operation, trip, now());
    BEGIN
        INSERT INTO route_geometry_holds (travel_operation_id, route_id, route_version) VALUES (late_operation, route, 1);
        RAISE EXCEPTION 'Accepted a late hold after tombstone';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
    INSERT INTO route_hold_batches (travel_operation_id, trip_id) VALUES (operation, trip);
    INSERT INTO route_geometry_holds (travel_operation_id, route_id, route_version) VALUES (operation, route, 1);
    INSERT INTO route_hold_batch_pois (travel_operation_id, poi_id) VALUES (operation, place);
    DELETE FROM route_geometry_holds WHERE travel_operation_id = operation;
    DELETE FROM route_hold_batch_pois WHERE travel_operation_id = operation;
    UPDATE route_hold_batches SET released_at = clock_timestamp() WHERE travel_operation_id = operation;
    BEGIN
        INSERT INTO route_hold_batch_pois (travel_operation_id, poi_id) VALUES (operation, place);
        RAISE EXCEPTION 'Accepted a late POI after release';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
END $$;

RESET ROLE;
