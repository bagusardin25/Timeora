-- Migration 003: optimize active event lookups
-- Speeds up conflict checks and calendar window reads for active events.

CREATE INDEX IF NOT EXISTS idx_events_active_user_date_time
    ON events (user_id, date, start_time)
    WHERE deleted_at IS NULL;