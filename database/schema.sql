CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(32) UNIQUE NOT NULL,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash BYTEA NOT NULL,
    is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    key_encryption_salt VARCHAR(255) NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE friendships (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL REFERENCES users(id),
    addressee_id INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,
    CONSTRAINT uq_friendship_direction UNIQUE (requester_id, addressee_id)
);

CREATE TABLE app_notifications (
    id VARCHAR(36) PRIMARY KEY,
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    actor_id INTEGER REFERENCES users(id),
    kind VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    resource_type VARCHAR(32),
    resource_id VARCHAR(64),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE groups (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE group_memberships (
    id SERIAL PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL REFERENCES groups(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(16) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_group_membership UNIQUE (group_id, user_id)
);

CREATE TABLE upload_sessions (
    id VARCHAR(36) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    media_type VARCHAR(16) NOT NULL,
    total_size BIGINT NOT NULL,
    chunk_size INTEGER NOT NULL,
    received_bytes BIGINT NOT NULL DEFAULT 0,
    tmp_path TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'initiated',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media_assets (
    id VARCHAR(36) PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    storage_provider VARCHAR(32) NOT NULL,
    storage_key TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    local_path TEXT,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    media_type VARCHAR(16) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE chat_messages (
    id VARCHAR(36) PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    kind VARCHAR(16) NOT NULL DEFAULT 'text',
    sender_payload TEXT,
    recipient_payload TEXT,
    media_id VARCHAR(36) REFERENCES media_assets(id),
    is_seen BOOLEAN NOT NULL DEFAULT FALSE,
    seen_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE group_messages (
    id VARCHAR(36) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL REFERENCES groups(id),
    sender_id INTEGER NOT NULL REFERENCES users(id),
    kind VARCHAR(16) NOT NULL DEFAULT 'text',
    payload TEXT,
    media_id VARCHAR(36) REFERENCES media_assets(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE screenshot_events (
    id VARCHAR(36) PRIMARY KEY,
    reporter_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id INTEGER NOT NULL REFERENCES users(id),
    conversation_user_id INTEGER NOT NULL REFERENCES users(id),
    reason VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
