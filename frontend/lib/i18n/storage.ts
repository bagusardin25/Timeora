import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, type Locale } from "./types";

const PREFERENCES_KEY = "timeora_preferences";

/** Read locale without React (safe for api.ts). Default: en. */
export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const direct = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(direct)) return direct;

    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { locale?: unknown };
      if (isLocale(parsed.locale)) return parsed.locale;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function setStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ ...current, locale }),
    );
  } catch {
    /* ignore prefs merge failure */
  }
  window.dispatchEvent(new CustomEvent("timeora:locale-change", { detail: { locale } }));
}
