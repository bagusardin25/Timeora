"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import {
  callAssistant,
  executeAssistant,
  type AssistantExecuteParams,
  type AssistantResult,
} from "@/lib/api";
import type { EventData } from "@/components/calendar/EventDialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { speechLocale } from "@/lib/i18n/types";
import { ClarificationCard } from "./ClarificationCard";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  requestText?: string;
  result?: AssistantResult;
  /** True for failed request/execute bubbles. */
  isError?: boolean;
  /** True after a mutation was applied successfully. */
  isSuccess?: boolean;
  /** Confirmation UI lifecycle for this assistant draft. */
  actionState?: "open" | "confirmed";
  /** Clarification choice already picked on this bubble. */
  selectedChoiceId?: string;
};

type PendingExecute = {
  messageId: string;
  result: AssistantResult;
};

type FreeSlot = {
  start_time: string;
  duration_minutes?: number;
  reason?: string;
};

type SlotMemory = {
  date: string;
  duration: number;
  slots: FreeSlot[];
  titleHint: string;
};

const SUGGESTED_KEYS: Record<string, string> = {
  query: "assistant.promptToday",
  find_free_slot: "assistant.promptTonight",
  find_slot: "assistant.promptTonight",
  create: "assistant.promptMeeting",
  help: "assistant.promptToday",
  edit: "assistant.promptMeeting",
};

let fallbackMessageCounter = 0;

function createMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  fallbackMessageCounter += 1;
  return `msg-${Date.now().toString(36)}-${fallbackMessageCounter.toString(36)}`;
}

function subscribeMediaQuery(query: MediaQueryList, listener: () => void): () => void {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }

  query.addListener(listener);
  return () => query.removeListener(listener);
}

function useMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    update();
    return subscribeMediaQuery(query, update);
  }, []);
  return mobile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asDisplayString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function formatClock(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

type FreeSlotGroup = {
  date: string | null;
  duration: number;
  slots: FreeSlot[];
  titleHint: string;
  /** Highlight conflict recovery UI. */
  isConflict?: boolean;
  headline?: string;
};

function asFreeSlot(value: unknown): FreeSlot | null {
  if (!isRecord(value)) return null;
  const start = asDisplayString(value.start_time);
  if (!start) return null;
  return {
    start_time: start,
    duration_minutes:
      typeof value.duration_minutes === "number" ? value.duration_minutes : undefined,
    reason: asDisplayString(value.reason) ?? undefined,
  };
}

function localizeSlotReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  const map: Record<string, string> = {
    "Requested time is available": "Jam yang diminta tersedia",
    "During lunch break": "Waktu istirahat siang",
    "After lunch break": "Setelah istirahat siang",
    "Morning slot available": "Slot pagi tersedia",
  };
  if (map[reason]) return map[reason];
  const later = reason.match(/^Same day, (\d+) min later$/i);
  if (later) return `Hari yang sama, ${later[1]} menit kemudian`;
  const earlier = reason.match(/^Same day, (\d+) min earlier$/i);
  if (earlier) return `Hari yang sama, ${earlier[1]} menit lebih awal`;
  const hoursLater = reason.match(/^Same day, (\d+)h later$/i);
  if (hoursLater) return `Hari yang sama, ${hoursLater[1]} jam kemudian`;
  const hoursEarlier = reason.match(/^Same day, (\d+)h earlier$/i);
  if (hoursEarlier) return `Hari yang sama, ${hoursEarlier[1]} jam lebih awal`;
  return reason;
}

/** find_slot + conflict recovery show pickable cards — not create confirm previews. */
function extractFreeSlotGroup(result: AssistantResult): FreeSlotGroup | null {
  const isConflict = result.intent === "conflict";
  // Avoid double UI: create confirmation already has ActionPreviewCard.
  if (!isConflict && (result.intent === "create" || result.requires_confirmation)) {
    return null;
  }

  const payload = result.result;
  if (!payload) return null;

  // find_slot / conflict shape: { date, duration_minutes, slots: [...], title? }
  if (isRecord(payload) && Array.isArray(payload.slots)) {
    const slots = payload.slots.map(asFreeSlot).filter((slot): slot is FreeSlot => Boolean(slot));
    if (slots.length === 0) return null;
    const eventData = isRecord(payload.event_data) ? payload.event_data : null;
    const titleHint =
      asDisplayString(payload.title) ||
      (eventData ? asDisplayString(eventData.title) : null) ||
      "Meeting";
    return {
      date: asDisplayString(payload.date),
      duration: typeof payload.duration_minutes === "number" ? payload.duration_minutes : 60,
      slots: slots.map((slot) => ({ ...slot, reason: localizeSlotReason(slot.reason) })),
      titleHint,
      isConflict,
    };
  }

  // Legacy: bare array of slot objects (older find_slot responses)
  if (Array.isArray(payload)) {
    const slots = payload.map(asFreeSlot).filter((slot): slot is FreeSlot => Boolean(slot));
    if (slots.length === 0) return null;
    return {
      date: null,
      duration: 60,
      slots: slots.map((slot) => ({ ...slot, reason: localizeSlotReason(slot.reason) })),
      titleHint: "Meeting",
    };
  }

  return null;
}

function slotGroupToMemory(group: FreeSlotGroup): SlotMemory | null {
  if (!group.date || group.slots.length === 0) return null;
  return {
    date: group.date,
    duration: group.duration,
    slots: group.slots,
    titleHint: group.titleHint,
  };
}

/** Resolve short follow-ups like "pakai jam 14:00" / "yang kedua" against last find_slot. */
function resolveSlotReference(text: string, memory: SlotMemory | null): string | null {
  if (!memory?.slots.length || !memory.date) return null;
  const raw = text.trim();
  const low = raw.toLowerCase();
  if (!low) return null;

  // Already a full schedule command — let backend handle it.
  if (
    /\b(jadwalkan|schedule|buatin|buatkan)\b/.test(low) &&
    (/\b\d{4}-\d{2}-\d{2}\b/.test(low) || /\bbesok\b|\bhari ini\b/.test(low))
  ) {
    return null;
  }

  const looksLikeRef =
    /\b(pakai|pilih|ambil|yang|slot|jam|pukul|oke|ya+|itu|tadi|aja|saja)\b/.test(low) ||
    /^(jam\s*)?\d{1,2}([:.](\d{2}))?\s*$/.test(low) ||
    /^(pertama|kedua|ketiga|keempat|kelima|[1-5])$/.test(low);
  if (!looksLikeRef) return null;

  let index: number | null = null;
  const ordinals: Array<[RegExp, number]> = [
    [/\b(pertama|first|nomor\s*1|#\s*1|slot\s*1|yang\s*1)\b/, 0],
    [/\b(kedua|second|nomor\s*2|#\s*2|slot\s*2|yang\s*2)\b/, 1],
    [/\b(ketiga|third|nomor\s*3|#\s*3|slot\s*3|yang\s*3)\b/, 2],
    [/\b(keempat|fourth|nomor\s*4|#\s*4|slot\s*4|yang\s*4)\b/, 3],
    [/\b(kelima|fifth|nomor\s*5|#\s*5|slot\s*5|yang\s*5)\b/, 4],
  ];
  for (const [pattern, value] of ordinals) {
    if (pattern.test(low)) {
      index = value;
      break;
    }
  }

  if (
    index === null &&
    /\b(pakai|pilih|ambil|oke|ya+)\b/.test(low) &&
    /\b(itu|tadi|aja|saja|ini)\b/.test(low)
  ) {
    index = 0;
  }

  let slot: FreeSlot | null = null;
  if (index !== null && memory.slots[index]) {
    slot = memory.slots[index];
  } else {
    const timeMatch = low.match(/\b(?:jam|pukul)?\s*(\d{1,2})(?:[:.](\d{2}))?\b/);
    if (timeMatch) {
      const hour = Number(timeMatch[1]);
      const minute = timeMatch[2] ? Number(timeMatch[2]) : null;
      const matches = memory.slots.filter((item) => {
        const clock = formatClock(item.start_time);
        const [sh, sm] = clock.split(":").map(Number);
        if (minute !== null) return sh === hour && sm === minute;
        return sh === hour || sh === hour + 12 || sh === hour - 12;
      });
      slot = matches[0] ?? null;
    }
  }

  if (!slot) return null;
  const time = formatClock(slot.start_time);
  return `Jadwalkan ${memory.titleHint} pada ${memory.date} jam ${time}`;
}

function FreeSlotsCard({
  group,
  disabled,
  onPick,
  minutesLabel,
  freeLabel,
  freeHint,
  altLabel,
  altHint,
}: {
  group: FreeSlotGroup;
  disabled: boolean;
  onPick: (slot: FreeSlot) => void;
  minutesLabel: string;
  freeLabel: string;
  freeHint: string;
  altLabel: string;
  altHint: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        group.isConflict
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-background/60",
      )}
    >
      <p className="text-sm font-medium text-foreground">
        {group.isConflict ? altLabel : freeLabel}
        {group.date ? ` · ${group.date}` : ""}
        {` · ${minutesLabel}`}
      </p>
      <p className="text-xs text-muted-foreground">
        {group.isConflict ? altHint : freeHint}
      </p>
      <div className="flex flex-col gap-2">
        {group.slots.map((slot) => (
          <button
            key={`${group.date ?? "day"}-${slot.start_time}`}
            type="button"
            disabled={disabled}
            onClick={() => onPick(slot)}
            className="min-h-11 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
          >
            <span className="block text-sm font-medium">{formatClock(slot.start_time)}</span>
            {slot.reason ? (
              <span className="text-xs text-muted-foreground">{slot.reason}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function SuggestedActionChips({
  actions,
  disabled,
  onPick,
  t,
}: {
  actions: string[];
  disabled: boolean;
  onPick: (prompt: string) => void;
  t: (key: string) => string;
}) {
  const prompts = actions
    .map((action) => {
      const key = SUGGESTED_KEYS[action];
      return key ? t(key) : null;
    })
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  if (prompts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={disabled}
          onClick={() => onPick(prompt)}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & {
  isFinal?: boolean;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<SpeechRecognitionResultLike>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Rebuild the spoken phrase for this recognition session (never append cumulative chunks). */
function transcriptFromResults(results: ArrayLike<SpeechRecognitionResultLike>): string {
  let spoken = "";
  for (let i = 0; i < results.length; i += 1) {
    spoken += results[i]?.[0]?.transcript ?? "";
  }
  return spoken.trim();
}

function mergeVoiceQuery(base: string, spoken: string): string {
  const trimmedBase = base.trim();
  const trimmedSpoken = spoken.trim();
  if (!trimmedSpoken) return trimmedBase;
  if (!trimmedBase) return trimmedSpoken;
  return `${trimmedBase} ${trimmedSpoken}`;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function executionParams(result: AssistantResult): AssistantExecuteParams | null {
  if (!result.requires_confirmation || !isRecord(result.result)) return null;
  const data = result.result;
  if (result.intent === "create") {
    if (!isRecord(data.event_data)) return null;
    return {
      action: "create",
      event_data: data.event_data,
    };
  }
  if (result.intent === "cancel") {
    if (!isNonEmptyString(data.primary_event_id)) return null;
    return {
      action: "cancel",
      event_id: data.primary_event_id,
    };
  }
  if (result.intent === "reschedule") {
    if (
      !isNonEmptyString(data.primary_event_id) ||
      !isNonEmptyString(data.new_date) ||
      !isNonEmptyString(data.new_time)
    ) {
      return null;
    }
    return {
      action: "reschedule",
      event_id: data.primary_event_id,
      new_date: data.new_date,
      new_time: data.new_time,
    };
  }
  if (result.intent === "update" || result.intent === "edit") {
    const eventId = typeof data.primary_event_id === "string"
      ? data.primary_event_id
      : typeof data.event_id === "string"
        ? data.event_id
        : null;
    const eventData = data.event_data;
    if (!eventId || !eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
      return null;
    }
    return {
      action: "update",
      event_id: eventId,
      event_data: eventData as Record<string, unknown>,
    };
  }
  return null;
}

type ActionPreview = {
  badge: string;
  title: string;
  lines: string[];
  destructive: boolean;
  confirmLabel: string;
  confirmAriaLabel: string;
};

function buildActionPreview(
  result: AssistantResult,
  t: (key: string, vars?: Record<string, string | number>) => string,
): ActionPreview | null {
  const params = executionParams(result);
  if (!params || !isRecord(result.result)) return null;
  const data = result.result;
  const primaryTitle =
    asDisplayString(data.primary_title) ??
    asDisplayString(isRecord(data.event_data) ? data.event_data.title : null) ??
    "Event";

  if (params.action === "create" && isRecord(params.event_data)) {
    const ed = params.event_data;
    const title = asDisplayString(ed.title) ?? primaryTitle;
    const lines: string[] = [];
    const date = asDisplayString(ed.date);
    const time = asDisplayString(ed.start_time);
    if (date || time) {
      lines.push([date, time ? formatClock(time) : null].filter(Boolean).join(" · "));
    }
    const duration = ed.duration_minutes;
    if (typeof duration === "number") lines.push(t("assistant.minutes", { n: duration }));
    const participants = asDisplayString(ed.participants);
    if (participants) lines.push(participants);
    const label = t("assistant.confirmCreate");
    return {
      badge: t("assistant.createBadge"),
      title,
      lines,
      destructive: false,
      confirmLabel: label,
      confirmAriaLabel: label,
    };
  }

  if (params.action === "cancel") {
    return {
      badge: t("assistant.cancelBadge"),
      title: primaryTitle,
      lines: [t("assistant.cancelLine")],
      destructive: true,
      confirmLabel: t("assistant.confirmCancel"),
      confirmAriaLabel: t("assistant.confirmCancel"),
    };
  }

  if (params.action === "reschedule") {
    const lines: string[] = [];
    if (params.new_date || params.new_time) {
      const when = [params.new_date, params.new_time ? formatClock(params.new_time) : null]
        .filter(Boolean)
        .join(" · ");
      lines.push(t("assistant.toLabel", { when }));
    }
    return {
      badge: t("assistant.rescheduleBadge"),
      title: primaryTitle,
      lines,
      destructive: false,
      confirmLabel: t("assistant.confirmReschedule"),
      confirmAriaLabel: t("assistant.confirmReschedule"),
    };
  }

  if (params.action === "update" && params.event_data) {
    const lines = Object.entries(params.event_data)
      .slice(0, 4)
      .map(([key, value]) => `${key}: ${String(value)}`);
    return {
      badge: t("assistant.updateBadge"),
      title: primaryTitle,
      lines: lines.length > 0 ? lines : [t("assistant.updateFallback")],
      destructive: false,
      confirmLabel: t("assistant.confirmUpdate"),
      confirmAriaLabel: t("assistant.confirmUpdate"),
    };
  }

  return null;
}

function ActionPreviewCard({
  preview,
  disabled,
  confirmed,
  onConfirm,
  onEdit,
  doneLabel,
  alreadyLabel,
  editLabel,
}: {
  preview: ActionPreview;
  disabled: boolean;
  confirmed: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  doneLabel: string;
  alreadyLabel: string;
  editLabel: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        confirmed
          ? "border-emerald-500/30 bg-emerald-500/5"
          : preview.destructive
            ? "border-destructive/30 bg-destructive/5"
            : "border-border bg-background/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {preview.badge}
          </p>
          <p className="truncate font-medium text-foreground">{preview.title}</p>
          {preview.lines.map((line) => (
            <p key={line} className="text-xs text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
        {confirmed ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            {doneLabel}
          </span>
        ) : null}
      </div>
      {confirmed ? (
        <p className="text-xs text-muted-foreground">{alreadyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={preview.destructive ? "destructive" : "default"}
            disabled={disabled}
            aria-label={preview.confirmAriaLabel}
            onClick={onConfirm}
          >
            <Check data-icon="inline-start" />
            {preview.confirmLabel}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onEdit}>
            {editLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export function AssistantPanel({
  open,
  onOpenChange,
  onEventsChanged,
  contextEvent,
  onClearContext,
  onViewCalendar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventsChanged: () => void;
  contextEvent?: EventData | null;
  onClearContext?: () => void;
  /** Close chat and let user focus the calendar after a successful mutation. */
  onViewCalendar?: () => void;
}) {
  const { t, locale } = useI18n();
  const quickPrompts = [
    t("assistant.promptToday"),
    t("assistant.promptTonight"),
    t("assistant.promptMeeting"),
  ];
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const [pendingExecute, setPendingExecute] = useState<PendingExecute | null>(null);
  const [slotMemory, setSlotMemory] = useState<SlotMemory | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  /** Text already in the input when a voice session starts (typed text preserved once). */
  const voiceBaseRef = useRef("");
  const slotMemoryRef = useRef<SlotMemory | null>(null);
  const isMobile = useMobile();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    slotMemoryRef.current = slotMemory;
  }, [slotMemory]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
      if (event.key === "Escape" && open) onOpenChange(false);
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [onOpenChange, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({
      top: scrollRef.current.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [messages, pending, reduceMotion]);

  // Auto-focus composer when panel opens
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Stop recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  // Stop recognition when panel is closed. `onend` clears isListening.
  useEffect(() => {
    if (!open) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    }
  }, [open]);

  // Stop recognition while a request is in flight. `onend` clears isListening.
  useEffect(() => {
    if (pending && isListening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    }
  }, [pending, isListening]);

  const toggleListening = () => {
    if (pending) return;

    if (isListening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setVoiceError(t("assistant.voiceUnsupported"));
      return;
    }

    setVoiceError(null);
    // Snapshot typed text once per session so progressive results replace speech, not stack.
    voiceBaseRef.current = query.trim();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    // Live partials are fine; we rebuild the full session phrase on every event.
    recognition.interimResults = true;
    recognition.lang = speechLocale(locale);

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
    };

    recognition.onresult = (event) => {
      // Browsers often fire progressive updates where results[0] grows to the full
      // phrase. Always rebuild from the whole results list + session base — never
      // append each event onto the previous query state.
      const spoken = transcriptFromResults(event.results);
      if (!spoken) return;
      setQuery(mergeVoiceQuery(voiceBaseRef.current, spoken));
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setVoiceError(t("assistant.voiceDenied"));
      } else if (event.error === "no-speech") {
        setVoiceError(t("assistant.voiceNoSpeech"));
      } else if (event.error !== "aborted") {
        setVoiceError(t("assistant.voiceFailed"));
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setVoiceError(t("assistant.voiceFailed"));
      setIsListening(false);
      recognitionRef.current = null;
    }
  };

  const rememberSlotsFromResult = (result: AssistantResult) => {
    const group = extractFreeSlotGroup(result);
    const memory = group ? slotGroupToMemory(group) : null;
    if (memory) {
      setSlotMemory(memory);
      slotMemoryRef.current = memory;
    }
  };

  const submit = async (
    text: string,
    options?: { selected_event_id?: string; context_event_id?: string },
    addUserMessage = true,
  ) => {
    const typed = text.trim();
    if (!typed || pending) return;

    const resolved = resolveSlotReference(typed, slotMemoryRef.current);
    const normalized = resolved ?? typed;
    const displayText = resolved && resolved !== typed ? typed : normalized;

    if (addUserMessage) {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "user",
          text: resolved && resolved !== typed ? `${typed} → ${normalized}` : displayText,
        },
      ]);
    }
    setPending(true);
    setRetryText(null);
    setPendingExecute(null);
    try {
      const result = await callAssistant(normalized, options);
      rememberSlotsFromResult(result);
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          text: result.message,
          requestText: normalized,
          result,
          actionState: executionParams(result) ? "open" : undefined,
        },
      ]);
      setQuery("");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("assistant.processFailed");
      setMessages((current) => [
        ...current,
        { id: createMessageId(), role: "assistant", text: message, isError: true },
      ]);
      setRetryText(typed);
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(
      query,
      contextEvent?.id ? { context_event_id: contextEvent.id } : undefined,
    );
  };

  const confirmResult = async (messageId: string, result: AssistantResult) => {
    const params = executionParams(result);
    if (!params || pending) return;

    const source = messages.find((message) => message.id === messageId);
    if (source?.actionState === "confirmed") return;

    setPending(true);
    setPendingExecute(null);
    setRetryText(null);
    try {
      const executed = await executeAssistant(params);
      const isConflict =
        executed.intent === "conflict" ||
        (isRecord(executed.result) && executed.result.conflict === true);

      if (isConflict) {
        rememberSlotsFromResult(executed);
        setMessages((current) => [
          ...current,
          {
            id: createMessageId(),
            role: "assistant",
            text: executed.message,
            result: executed,
            isError: true,
          },
        ]);
        return;
      }

      setMessages((current) => [
        ...current.map((message) =>
          message.id === messageId ? { ...message, actionState: "confirmed" as const } : message,
        ),
        {
          id: createMessageId(),
          role: "assistant",
          text: executed.message,
          result: executed,
          isSuccess: true,
        },
      ]);
      onEventsChanged();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("assistant.actionFailed");
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          text: message,
          isError: true,
        },
      ]);
      setPendingExecute({ messageId, result });
    } finally {
      setPending(false);
    }
  };

  const viewCalendar = () => {
    onEventsChanged();
    if (onViewCalendar) {
      onViewCalendar();
    } else {
      onOpenChange(false);
    }
  };

  const editRequest = (requestText: string) => {
    setQuery(requestText);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const content = (
    <div className="flex min-h-0 flex-1 flex-col bg-popover text-popover-foreground">
      <header className="flex min-h-16 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold">{t("assistant.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("assistant.subtitle")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("assistant.close")}
          onClick={() => onOpenChange(false)}
        >
          <X />
        </Button>
      </header>

      {contextEvent ? (
        <div className="flex items-center gap-2 border-b border-border bg-accent/40 px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("assistant.contextEvent")}
            </p>
            <p className="truncate text-sm font-medium text-foreground">{contextEvent.title}</p>
            <p className="text-xs text-muted-foreground">
              {contextEvent.date}
              {contextEvent.start_time ? ` · ${formatClock(contextEvent.start_time)}` : ""}
            </p>
          </div>
          {onClearContext ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={t("assistant.clearContext")}
              onClick={onClearContext}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="my-auto flex flex-col items-center gap-4 text-center text-muted-foreground">
            <Bot className="size-8 text-primary" />
            <div>
              <p className="font-medium text-foreground">{t("assistant.emptyTitle")}</p>
              <p className="mt-1 max-w-xs text-sm">
                {t("assistant.emptyBody")}
              </p>
            </div>
            <div className="flex max-w-sm flex-wrap justify-center gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void submit(
                      prompt,
                      contextEvent?.id ? { context_event_id: contextEvent.id } : undefined,
                    )
                  }
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {messages.map((message) => {
            const preview =
              message.role === "assistant" && message.result
                ? buildActionPreview(message.result, t)
                : null;
            const freeSlots =
              message.role === "assistant" && message.result
                ? extractFreeSlotGroup(message.result)
                : null;
            const confirmed = message.actionState === "confirmed";

            return (
              <motion.div
                key={message.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  message.role === "user"
                    ? "ml-10 rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground"
                    : "mr-6 flex flex-col gap-3 rounded-2xl rounded-bl-md border px-4 py-3 text-sm",
                  message.role === "assistant" &&
                    (message.isError
                      ? "border-destructive/40 bg-destructive/5"
                      : message.isSuccess
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-border bg-card"),
                )}
              >
                {message.isSuccess ? (
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    {t("assistant.success")}
                  </p>
                ) : null}
                {message.isError ? (
                  <p className="text-xs font-medium text-destructive">
                    {message.result?.intent === "conflict"
                      ? t("assistant.conflict")
                      : t("assistant.failed")}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap">{message.text}</p>

                {message.result?.events?.length ? (
                  <div className="flex flex-col gap-2">
                    {message.result.events.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-lg border border-border bg-background/60 p-2"
                      >
                        <p className="font-medium">{event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.date} · {event.start_time.slice(0, 5)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {freeSlots ? (
                  <FreeSlotsCard
                    group={freeSlots}
                    disabled={pending || confirmed}
                    minutesLabel={t("assistant.minutes", { n: freeSlots.duration })}
                    freeLabel={t("assistant.freeSlots")}
                    freeHint={t("assistant.freeSlotsHint", { title: freeSlots.titleHint })}
                    altLabel={t("assistant.altSlots")}
                    altHint={t("assistant.altSlotsHint", { title: freeSlots.titleHint })}
                    onPick={(slot) => {
                      const time = formatClock(slot.start_time);
                      const dayPart = freeSlots.date ? `pada ${freeSlots.date}` : "besok";
                      void submit(
                        `Jadwalkan ${freeSlots.titleHint} ${dayPart} jam ${time}`,
                      );
                    }}
                  />
                ) : null}

                {message.result?.intent === "help" ||
                (message.result?.suggested_actions?.length &&
                  !preview &&
                  !freeSlots &&
                  !message.result.clarification) ? (
                  <SuggestedActionChips
                    actions={message.result.suggested_actions || ["query", "find_free_slot", "create"]}
                    disabled={pending}
                    t={t}
                    onPick={(prompt) => void submit(prompt)}
                  />
                ) : null}

                {message.result?.clarification && message.requestText ? (
                  <ClarificationCard
                    clarification={message.result.clarification}
                    disabled={pending || Boolean(message.selectedChoiceId)}
                    resolvedChoiceId={message.selectedChoiceId}
                    onSelect={(eventId) => {
                      setMessages((current) =>
                        current.map((item) =>
                          item.id === message.id
                            ? { ...item, selectedChoiceId: eventId }
                            : item,
                        ),
                      );
                      void submit(
                        message.requestText as string,
                        { selected_event_id: eventId },
                        false,
                      );
                    }}
                  />
                ) : null}

                {preview && message.result ? (
                  <ActionPreviewCard
                    preview={preview}
                    disabled={pending || confirmed}
                    confirmed={confirmed}
                    onConfirm={() => void confirmResult(message.id, message.result as AssistantResult)}
                    onEdit={() => editRequest(message.requestText || "")}
                    doneLabel={t("assistant.done")}
                    alreadyLabel={t("assistant.alreadyConfirmed")}
                    editLabel={t("assistant.editRequest")}
                  />
                ) : null}

                {message.isSuccess ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={viewCalendar}
                    className="w-fit"
                  >
                    <CalendarDays data-icon="inline-start" />
                    {t("assistant.viewCalendar")}
                  </Button>
                ) : null}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {pending ? (
          <div
            className="mr-auto flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3"
            aria-label={t("assistant.thinking")}
          >
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                className="size-1.5 rounded-full bg-primary"
                animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
                transition={{ repeat: Infinity, duration: 0.9, delay: dot * 0.12 }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {retryText ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-1"
            onClick={() => void submit(retryText)}
          >
            <RotateCcw data-icon="inline-start" /> {t("assistant.retryRequest")}
          </Button>
        ) : null}
        {pendingExecute ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-1"
            disabled={pending}
            onClick={() =>
              void confirmResult(pendingExecute.messageId, pendingExecute.result)
            }
          >
            <RotateCcw data-icon="inline-start" /> {t("assistant.retryAction")}
          </Button>
        ) : null}
        {isListening ? (
          <p className="mb-2 px-1 text-xs font-medium text-destructive" aria-live="polite">
            {t("assistant.listening")} ({speechLocale(locale)})
          </p>
        ) : null}
        {voiceError ? (
          <p className="mb-2 px-1 text-xs text-destructive" role="alert">
            {voiceError}
          </p>
        ) : null}
        <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
          <Textarea
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={t("assistant.placeholder")}
            rows={1}
            disabled={pending}
            className="max-h-32 min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            size="icon"
            variant={isListening ? "destructive" : "ghost"}
            aria-label={isListening ? t("assistant.stopVoice") : t("assistant.startVoice")}
            aria-pressed={isListening}
            disabled={pending}
            onClick={toggleListening}
            className="size-11 shrink-0 rounded-xl"
          >
            {isListening ? <MicOff /> : <Mic />}
          </Button>
          <Button
            type="submit"
            size="icon"
            aria-label={t("assistant.send")}
            disabled={pending || !query.trim()}
            className="size-11 shrink-0 rounded-xl"
          >
            <Send />
          </Button>
        </div>
      </form>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle snapPoints={[0.58, 0.94]}>
        <DrawerContent className="h-[94dvh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{t("assistant.title")}</DrawerTitle>
            <DrawerDescription>
              {t("assistant.subtitle")}
            </DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return open ? (
    <motion.aside
      initial={reduceMotion ? false : { x: 32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 32, opacity: 0 }}
      className="fixed inset-y-0 right-0 z-50 flex w-[var(--assistant-dock-width,min(400px,38vw))] min-w-0 max-w-full border-l border-border bg-popover shadow-2xl md:shadow-[-12px_0_40px_-20px_rgba(0,0,0,0.25)]"
      aria-label={t("assistant.title")}
      style={{ ["--assistant-dock-width" as string]: "min(400px, 38vw)" }}
    >
      {content}
    </motion.aside>
  ) : null;
}
