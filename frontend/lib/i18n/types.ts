export type Locale = "en" | "id";

export const LOCALES: Locale[] = ["en", "id"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "timeora_locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "id";
}

export function speechLocale(locale: Locale): string {
  return locale === "id" ? "id-ID" : "en-US";
}

export function acceptLanguage(locale: Locale): string {
  return locale === "id" ? "id-ID,id;q=0.9,en;q=0.8" : "en-US,en;q=0.9,id;q=0.8";
}
