CREATE TABLE catalog_regions (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
    label text NOT NULL CHECK (btrim(label) <> ''),
    boundary public.geometry(MultiPolygon, 4326) NOT NULL CHECK (
        NOT public.ST_IsEmpty(boundary) AND public.ST_IsValid(boundary)
    )
);

CREATE INDEX trip_catalog_entries_start_geometry_idx
    ON trip_catalog_entries USING gist ((start_geog::public.geometry));

CREATE TABLE catalog_difficulties (
    code text PRIMARY KEY CHECK (code ~ '^[a-z]+$'),
    label text NOT NULL UNIQUE CHECK (btrim(label) <> ''),
    position smallint NOT NULL UNIQUE CHECK (position > 0)
);

CREATE TABLE catalog_difficulty_aliases (
    alias text PRIMARY KEY CHECK (btrim(alias) <> ''),
    difficulty_code text NOT NULL REFERENCES catalog_difficulties (code)
);

INSERT INTO catalog_difficulties (code, label, position) VALUES
    ('easy', 'Лёгкая', 1),
    ('moderate', 'Средняя', 2),
    ('hard', 'Сложная', 3),
    ('other', 'Другая сложность', 4);

INSERT INTO catalog_difficulty_aliases (alias, difficulty_code) VALUES
    ('easy', 'easy'), ('легкая', 'easy'), ('легкий', 'easy'), ('легко', 'easy'),
    ('moderate', 'moderate'), ('средняя', 'moderate'), ('средний', 'moderate'),
    ('hard', 'hard'), ('сложная', 'hard'), ('сложный', 'hard'), ('сложно', 'hard');

REVOKE INSERT, UPDATE, DELETE ON catalog_regions, catalog_difficulties, catalog_difficulty_aliases
    FROM tropio_travel_runtime;
