CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $platform$
DECLARE
    service text;
    role_name text;
    owner_role text;
    runtime_role text;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_extension AS e
        JOIN pg_namespace AS n ON n.oid = e.extnamespace
        WHERE e.extname = 'postgis' AND n.nspname = 'public'
    ) THEN
        RAISE EXCEPTION 'PostGIS must be installed in public';
    END IF;

    FOREACH service IN ARRAY ARRAY['identity', 'travel', 'geo'] LOOP
        owner_role := format('tropio_%s_owner', service);
        runtime_role := format('tropio_%s_runtime', service);

        FOREACH role_name IN ARRAY ARRAY[owner_role, runtime_role] LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                BEGIN
                    EXECUTE format(
                        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
                        role_name
                    );
                EXCEPTION
                    WHEN duplicate_object OR unique_violation THEN NULL;
                END;
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_roles
                WHERE rolname = role_name AND NOT rolcanlogin AND NOT rolsuper
                    AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
            ) THEN
                RAISE EXCEPTION 'Unexpected attributes for role %', role_name;
            END IF;
        END LOOP;

        EXECUTE format('CREATE SCHEMA %I AUTHORIZATION %I', service, owner_role);
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', service);
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', service, runtime_role);
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
            owner_role, service, runtime_role
        );
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I',
            owner_role, service, runtime_role
        );
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', owner_role);
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO %I',
            owner_role, service, runtime_role
        );
    END LOOP;
END;
$platform$;
