"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Check, RotateCcw, Send, Sparkles, X } from "lucide-react";
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
import { ClarificationCard } from "./ClarificationCard";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  requestText?: string;
  result?: AssistantResult;
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

export function AssistantPanel({
  open,
  onOpenChange,
  onEventsChanged,
  contextEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventsChanged: () => void;
  contextEvent?: EventData | null;
}) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobile();
  const reduceMotion = useReducedMotion();

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
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, pending, reduceMotion]);

  const submit = async (
    text: string,
    options?: { selected_event_id?: string; context_event_id?: string },
    addUserMessage = true,
  ) => {
    const normalized = text.trim();
    if (!normalized || pending) return;
    if (addUserMessage) {
      setMessages((current) => [...current, { id: createMessageId(), role: "user", text: normalized }]);
    }
    setPending(true);
    setRetryText(null);
    try {
      const result = await callAssistant(normalized, options);
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          text: result.message,
          requestText: normalized,
          result,
        },
      ]);
      setQuery("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Timeora could not process that request.";
      setMessages((current) => [...current, { id: createMessageId(), role: "assistant", text: message }]);
      setRetryText(normalized);
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

  const confirmResult = async (result: AssistantResult) => {
    const params = executionParams(result);
    if (!params || pending) return;
    setPending(true);
    try {
      const executed = await executeAssistant(params);
      setMessages((current) => [
        ...current,
        { id: createMessageId(), role: "assistant", text: executed.message, result: executed },
      ]);
      onEventsChanged();
    } catch (error: unknown) {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          text: error instanceof Error ? error.message : "The calendar action failed.",
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  const content = (
    <div className="flex min-h-0 flex-1 flex-col bg-popover text-popover-foreground">
      <header className="flex min-h-16 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold">Ask your calendar</h2>
            <p className="text-xs text-muted-foreground">Query, create, and reschedule safely</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Close AI chat" onClick={() => onOpenChange(false)}>
          <X />
        </Button>
      </header>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="my-auto flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Bot className="size-8 text-primary" />
            <div>
              <p className="font-medium text-foreground">Ask directly about your calendar</p>
              <p className="mt-1 max-w-xs text-sm">Try “Apa jadwal saya hari ini?” or “Pindahkan Product Sync ke jam 3.”</p>
            </div>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={message.role === "user" ? "ml-10 rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground" : "mr-6 flex flex-col gap-3 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm"}
            >
              <p>{message.text}</p>
              {message.result?.events?.length ? (
                <div className="flex flex-col gap-2">
                  {message.result.events.map((event) => (
                    <div key={event.id} className="rounded-lg border border-border bg-background/60 p-2">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.date} · {event.start_time.slice(0, 5)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {message.result?.clarification && message.requestText ? (
                <ClarificationCard
                  clarification={message.result.clarification}
                  disabled={pending}
                  onSelect={(eventId) => void submit(message.requestText as string, { selected_event_id: eventId }, false)}
                />
              ) : null}
              {message.result && executionParams(message.result) ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={pending} aria-label="Confirm action" onClick={() => void confirmResult(message.result as AssistantResult)}>
                    <Check data-icon="inline-start" /> Confirm
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setQuery(message.requestText || "")}>Edit request</Button>
                </div>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>

        {pending ? (
          <div className="mr-auto flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3" aria-label="AI is thinking">
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

      <form onSubmit={handleSubmit} className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {retryText ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void submit(retryText)}>
            <RotateCcw data-icon="inline-start" /> Retry last request
          </Button>
        ) : null}
        <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
          <Textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask or type a message…"
            rows={1}
            disabled={pending}
            className="max-h-32 min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="icon" aria-label="Send" disabled={pending || !query.trim()} className="size-11 shrink-0 rounded-xl">
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
            <DrawerTitle>Ask your calendar</DrawerTitle>
            <DrawerDescription>Use AI tools to query and update Timeora events.</DrawerDescription>
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
      className="fixed inset-y-0 right-0 z-50 flex w-[min(430px,38vw)] min-w-[360px] border-l border-border bg-popover shadow-2xl"
      aria-label="Ask your calendar"
    >
      {content}
    </motion.aside>
  ) : null;
}
