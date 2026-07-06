-- Timeora database schema
-- Run this in Supabase SQL Editor

-- Users table (auto-synced saat login lewat auth.py)
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    CREATE TYPE event_sync_status AS ENUM ('not_synced', 'pending', 'synced', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    date              DATE NOT NULL,
    start_time        TIME NOT NULL,
    duration_minutes  INTEGER NOT NULL CHECK (duration_minutes >= 5 AND duration_minutes <= 1440),
    participants      TEXT DEFAULT '',
    recurrence_rule   TEXT DEFAULT NULL,
    category          TEXT DEFAULT NULL,
    description       TEXT NOT NULL DEFAULT '',
    location_url      TEXT DEFAULT NULL,
    priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'important')),
    tags              TEXT[] NOT NULL DEFAULT '{}',
    reminder_minutes  INTEGER DEFAULT NULL CHECK (reminder_minutes IS NULL OR (reminder_minutes >= 0 AND reminder_minutes <= 10080)),
    deleted_at        TIMESTAMPTZ DEFAULT NULL,
    external_ids      JSONB NOT NULL DEFAULT '{}'::jsonb,
    sync_status       event_sync_status NOT NULL DEFAULT 'not_synced',
    last_synced_at    TIMESTAMPTZ DEFAULT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, date);
CREATE INDEX IF NOT EXISTS idx_events_external_ids ON events USING GIN (external_ids);

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

CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations (user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_user_active
    ON webhook_subscriptions (user_id, active);
CREATE INDEX IF NOT EXISTS idx_sync_logs_user_created
    ON sync_logs (user_id, created_at DESC);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
