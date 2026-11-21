CREATE TABLE personal_equipment_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL,
    label text COLLATE pg_catalog."unicode" NOT NULL CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 120),
    label_key text GENERATED ALWAYS AS (lower(label)) STORED,
    UNIQUE (owner_user_id, label_key),
    UNIQUE (owner_user_id, id)
);

CREATE TABLE personal_equipment_subgroups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL,
    group_id uuid NOT NULL,
    label text COLLATE pg_catalog."unicode" NOT NULL CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 120),
    label_key text GENERATED ALWAYS AS (lower(label)) STORED,
    FOREIGN KEY (owner_user_id, group_id) REFERENCES personal_equipment_groups (owner_user_id, id),
    UNIQUE (group_id, label_key),
    UNIQUE (owner_user_id, group_id, id)
);

ALTER TABLE personal_equipment
    ADD COLUMN group_id uuid,
    ADD COLUMN subgroup_id uuid,
    ADD COLUMN icon text CHECK (icon IN ('documents', 'clothing', 'hygiene', 'health', 'electronics', 'bags', 'food', 'orientation', 'camp', 'cooking', 'hiking', 'cycling', 'car', 'water', 'winter', 'city', 'family', 'other')),
    ADD CHECK (subgroup_id IS NULL OR group_id IS NOT NULL),
    ADD FOREIGN KEY (owner_user_id, group_id) REFERENCES personal_equipment_groups (owner_user_id, id),
    ADD FOREIGN KEY (owner_user_id, group_id, subgroup_id) REFERENCES personal_equipment_subgroups (owner_user_id, group_id, id);

ALTER TABLE equipment_commands
    ADD COLUMN request_options jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(request_options) = 'object');

REVOKE UPDATE, DELETE ON personal_equipment_groups, personal_equipment_subgroups FROM tropio_travel_runtime;
