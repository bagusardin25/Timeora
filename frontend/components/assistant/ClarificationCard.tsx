"use client";

import { useState } from "react";

import type { AssistantResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

type Clarification = NonNullable<AssistantResult["clarification"]>;

function formatChoiceMeta(choice: Clarification["choices"][number]): string | null {
  const parts: string[] = [];
  if (choice.date) parts.push(choice.date);
  if (choice.start_time) parts.push(choice.start_time.slice(0, 5));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function ClarificationCard({
  clarification,
  disabled,
  onSelect,
  resolvedChoiceId = null,
}: {
  clarification: Clarification;
  disabled: boolean;
  onSelect: (eventId: string) => void;
  /** When set, that choice is marked selected and further picks are blocked. */
  resolvedChoiceId?: string | null;
}) {
  const { t } = useI18n();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const selectedId = resolvedChoiceId ?? pendingId;
  const locked = Boolean(resolvedChoiceId) || disabled;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3">
      <p className="text-sm font-medium text-foreground">{clarification.prompt}</p>
      {clarification.choices.map((choice) => {
        const meta = formatChoiceMeta(choice);
        const isSelected = selectedId === choice.id;
        return (
          <button
            key={choice.id}
            type="button"
            disabled={locked}
            aria-pressed={isSelected}
            onClick={() => {
              if (locked) return;
              setPendingId(choice.id);
              onSelect(choice.id);
            }}
            className={cn(
              "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
              isSelected
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-card hover:border-primary hover:bg-accent",
            )}
          >
            <span className="block text-sm font-medium">{choice.title}</span>
            {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
            {isSelected ? (
              <span className="mt-0.5 block text-[11px] font-medium text-primary">
                {t("assistant.selected")}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
