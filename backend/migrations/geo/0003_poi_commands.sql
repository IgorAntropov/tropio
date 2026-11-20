INSERT INTO geo.poi_categories (id, code, label)
VALUES
    ('5d9a807f-b066-4a6b-af95-ecdb8689df01', 'viewpoint', 'Смотровая площадка'),
    ('5d9a807f-b066-4a6b-af95-ecdb8689df02', 'landmark', 'Достопримечательность'),
    ('5d9a807f-b066-4a6b-af95-ecdb8689df03', 'camp', 'Место стоянки'),
    ('5d9a807f-b066-4a6b-af95-ecdb8689df04', 'water', 'Источник воды'),
    ('5d9a807f-b066-4a6b-af95-ecdb8689df05', 'other', 'Другое')
ON CONFLICT (code) DO NOTHING;

REVOKE INSERT, UPDATE, DELETE ON geo.poi_categories FROM tropio_geo_runtime;

CREATE TABLE geo.poi_commands (
    actor_id uuid NOT NULL,
    operation text NOT NULL CHECK (operation IN ('create', 'edit', 'visibility', 'remove', 'attach', 'moderate')),
    target_id uuid NOT NULL,
    scope_id uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    poi_id uuid NOT NULL,
    result_revision_id uuid NOT NULL,
    source_trip_id uuid,
    response jsonb NOT NULL CHECK (jsonb_typeof(response) IN ('object', 'null')),
    PRIMARY KEY (actor_id, operation, target_id, scope_id, idempotency_key),
    FOREIGN KEY (poi_id, result_revision_id) REFERENCES geo.poi_revisions (poi_id, id)
);

CREATE INDEX poi_commands_result_idx ON geo.poi_commands (poi_id, result_revision_id);
REVOKE UPDATE, DELETE ON geo.poi_commands FROM tropio_geo_runtime;
