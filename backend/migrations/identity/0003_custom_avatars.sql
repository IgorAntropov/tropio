CREATE TABLE custom_avatars (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    image_webp bytea NOT NULL CHECK (octet_length(image_webp) BETWEEN 1 AND 2097152)
);
