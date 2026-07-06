export type UserPreferences = {
  timezone: string;
  defaultDuration: number;
  workingHoursStart: string;
  workingHoursEnd: string;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  timezone: "",
  defaultDuration: 60,
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
};

const STORAGE_KEY = "timeora_preferences";
const MIN_DEFAULT_DURATION = 5;
const MAX_DEFAULT_DURATION = 480;
const TIME_VALUE_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function toPreferenceRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeDefaultDuration(value: unknown): number {
  const duration = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : DEFAULT_PREFERENCES.defaultDuration;

  if (!Number.isFinite(duration)) {
    return DEFAULT_PREFERENCES.defaultDuration;
  }

  return Math.min(
    MAX_DEFAULT_DURATION,
    Math.max(MIN_DEFAULT_DURATION, Math.round(duration)),
  );
}

function normalizeTimeValue(value: unknown, fallback: string): string {
  return typeof value === "string" && TIME_VALUE_PATTERN.test(value)
    ? value
    : fallback;
}

export function normalizePreferences(
  value: unknown,
  fallbackTimezone = DEFAULT_PREFERENCES.timezone,
): UserPreferences {
  const preferences = toPreferenceRecord(value);

  return {
    timezone: typeof preferences.timezone === "string"
      ? preferences.timezone
      : fallbackTimezone,
    defaultDuration: normalizeDefaultDuration(preferences.defaultDuration),
    workingHoursStart: normalizeTimeValue(
      preferences.workingHoursStart,
      DEFAULT_PREFERENCES.workingHoursStart,
    ),
    workingHoursEnd: normalizeTimeValue(
      preferences.workingHoursEnd,
      DEFAULT_PREFERENCES.workingHoursEnd,
    ),
  };
}

export function readStoredPreferences(
  fallbackTimezone = DEFAULT_PREFERENCES.timezone,
): UserPreferences {
  if (typeof window === "undefined") {
    return normalizePreferences({}, fallbackTimezone);
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return normalizePreferences({}, fallbackTimezone);
    }

    return normalizePreferences(JSON.parse(stored), fallbackTimezone);
  } catch {
    return normalizePreferences({}, fallbackTimezone);
  }
}

export function savePreferences(preferences: UserPreferences): UserPreferences {
  const normalized = normalizePreferences(preferences);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
