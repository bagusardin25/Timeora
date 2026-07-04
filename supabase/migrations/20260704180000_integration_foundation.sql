-- Timeora integration foundation.

DO $$
BEGIN
    CREATE TYPE event_sync_status AS ENUM ('not_synced', 'pending', 'synced', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS sync_status event_sync_status NOT NULL DEFAULT 'not_synced',
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NULL;

CREATE TABLE IF NOT EXISTS integrations (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider                 TEXT NOT NULL,
    access_token_encrypted   TEXT,
    refresh_token_encrypted  TEXT,
    metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url          TEXT NOT NULL,
    event_types  TEXT[] NOT NULL DEFAULT ARRAY['event.created', 'event.updated', 'event.deleted'],
    description  TEXT NOT NULL DEFAULT '',
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider     TEXT NOT NULL,
    action       TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
    message      TEXT NOT NULL DEFAULT '',
    external_id  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_external_ids ON events USING GIN (external_ids);
CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations (user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_user_active
    ON webhook_subscriptions (user_id, active);
CREATE INDEX IF NOT EXISTS idx_sync_logs_user_created
    ON sync_logs (user_id, created_at DESC);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
