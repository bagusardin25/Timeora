-- Migration 001: Timeora v2 upgrades
-- Adds recurrence, category, and soft-delete support to events table.
-- Run this in the Supabase SQL Editor.

-- Add recurrence rule column (simple human-readable format: 'daily', 'weekly:monday', 'weekdays', 'monthly')
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_rule TEXT DEFAULT NULL;

-- Add category column for event categorization
ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL;

-- Add soft-delete column
ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for efficient soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events (deleted_at) WHERE deleted_at IS NULL;

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_events_category ON events (user_id, category) WHERE category IS NOT NULL;
