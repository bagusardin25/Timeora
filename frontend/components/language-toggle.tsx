"use client";

import { Globe } from "lucide-react";

import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/types";

export function LanguageToggle({
  className,
  compact = false,
}: {
  className?: string;
  /** Icon + short code only (navbar). */
  compact?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();

  const toggle = () => {
    const next: Locale = locale === "en" ? "id" : "en";
    setLocale(next);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-xl px-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
          className,
        )}
        aria-label={t("language.toggle")}
        title={`${t("language.label")}: ${locale === "en" ? t("language.en") : t("language.id")}`}
      >
        <Globe className="h-4 w-4" />
        <span className="w-5 text-center text-xs font-bold uppercase">{locale}</span>
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("language.label")}
      </span>
      <div className="inline-flex rounded-xl border border-border p-0.5">
        {(["en", "id"] as const).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              locale === code
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-pressed={locale === code}
          >
            {code === "en" ? t("language.en") : t("language.id")}
          </button>
        ))}
      </div>
    </div>
  );
}
