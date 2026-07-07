"use client";

import type { AssistantResult } from "@/lib/api";

type Clarification = NonNullable<AssistantResult["clarification"]>;

export function ClarificationCard({
  clarification,
  disabled,
  onSelect,
}: {
  clarification: Clarification;
  disabled: boolean;
  onSelect: (eventId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3">
      <p className="text-sm font-medium text-foreground">{clarification.prompt}</p>
      {clarification.choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(choice.id)}
          className="min-h-11 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
        >
          <span className="block text-sm font-medium">{choice.title}</span>
          {choice.start_time ? (
            <span className="text-xs text-muted-foreground">{choice.start_time.slice(0, 5)}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
