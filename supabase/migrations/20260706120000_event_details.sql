ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS location_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER DEFAULT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_priority_check'
    ) THEN
        ALTER TABLE public.events
            ADD CONSTRAINT events_priority_check
            CHECK (priority IN ('low', 'normal', 'important'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_reminder_minutes_check'
    ) THEN
        ALTER TABLE public.events
            ADD CONSTRAINT events_reminder_minutes_check
            CHECK (
                reminder_minutes IS NULL
                OR (reminder_minutes >= 0 AND reminder_minutes <= 10080)
            );
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_events_tags ON public.events USING GIN (tags);
