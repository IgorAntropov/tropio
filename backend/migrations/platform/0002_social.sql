DO $social$
DECLARE
    role_name text;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['tropio_social_owner', 'tropio_social_runtime'] LOOP
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
            BEGIN
                EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', role_name);
            EXCEPTION WHEN unique_violation OR duplicate_object THEN NULL;
            END;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name AND NOT rolcanlogin AND NOT rolsuper
            AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
            RAISE EXCEPTION 'Unexpected attributes for role %', role_name;
        END IF;
    END LOOP;
END;
$social$;

CREATE SCHEMA social AUTHORIZATION tropio_social_owner;
REVOKE ALL ON SCHEMA social FROM PUBLIC;
GRANT USAGE ON SCHEMA social TO tropio_social_runtime;
