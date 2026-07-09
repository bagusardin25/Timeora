"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getDictionary, translate, type Dictionary } from "@/lib/i18n/dictionaries";
import { getStoredLocale, setStoredLocale } from "@/lib/i18n/storage";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/types";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dictionary: Dictionary;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocaleState(getStoredLocale());
    setReady(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === "timeora_locale" || event.key === "timeora_preferences") {
        setLocaleState(getStoredLocale());
      }
    };
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ locale?: Locale }>).detail;
      if (detail?.locale === "en" || detail?.locale === "id") {
        setLocaleState(detail.locale);
      } else {
        setLocaleState(getStoredLocale());
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("timeora:locale-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("timeora:locale-change", onCustom);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale === "id" ? "id" : "en";
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setStoredLocale(next);
  }, []);

  const dictionary = useMemo(() => getDictionary(locale), [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(dictionary, key, vars),
    [dictionary],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, dictionary }),
    [locale, setLocale, t, dictionary],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  // Soft fallback for tests / edge SSR without provider.
  if (!ctx) {
    const dictionary = getDictionary(DEFAULT_LOCALE);
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => translate(dictionary, key, vars),
      dictionary,
    };
  }
  return ctx;
}
