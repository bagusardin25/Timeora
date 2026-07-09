-- Optimize active event lookups used by conflict checks and calendar window reads.

CREATE INDEX IF NOT EXISTS idx_events_active_user_date_time
    ON public.events (user_id, date, start_time)
    WHERE deleted_at IS NULL;