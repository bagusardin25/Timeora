"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventInput } from "@fullcalendar/core";
import { Bell, BellOff, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createReminderScheduler,
  requestReminderPermission,
  type ReminderDelivery,
  type ReminderEvent,
  type ReminderPermissionState,
} from "@/lib/reminders";

function readPermission(): ReminderPermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toLocalTime(value: Date): string {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function toReminderEvent(event: EventInput): ReminderEvent | null {
  const ext = (event.extendedProps || {}) as Record<string, unknown>;
  if (ext.reminder_minutes === null || ext.reminder_minutes === undefined) {
    return null;
  }
  if (!event.id || !event.title || !event.start) return null;

  const start = event.start instanceof Date ? event.start : new Date(event.start as string | number);
  if (Number.isNaN(start.getTime())) return null;

  const reminderMinutes =
    typeof ext.reminder_minutes === "number" ? ext.reminder_minutes : Number(ext.reminder_minutes);
  if (!Number.isFinite(reminderMinutes) || reminderMinutes < 0) {
    return null;
  }

  return {
    id: String(event.id),
    title: String(event.title),
    date: toLocalDate(start),
    start_time: toLocalTime(start),
    participants: typeof ext.participants === "string" ? ext.participants : "",
    reminder_minutes: reminderMinutes,
  };
}

export function NotificationCenter({ events }: { events: EventInput[] }) {
  const [permission, setPermission] = useState<ReminderPermissionState>(() => readPermission());
  const [fallbacks, setFallbacks] = useState<ReminderDelivery[]>([]);
  const schedulerRef = useRef<ReturnType<typeof createReminderScheduler> | null>(null);

  const reminderEvents = useMemo(
    () => events.map(toReminderEvent).filter((event): event is ReminderEvent => event !== null),
    [events],
  );

  useEffect(() => {
    schedulerRef.current = createReminderScheduler({
      fallback: (delivery) => {
        setFallbacks((current) => {
          if (current.some((item) => item.key === delivery.key)) return current;
          return [delivery, ...current].slice(0, 4);
        });
      },
    });

    return () => schedulerRef.current?.cancel();
  }, []);

  useEffect(() => {
    schedulerRef.current?.schedule(reminderEvents);
  }, [reminderEvents]);

  const handleEnableNotifications = async () => {
    const nextPermission = await requestReminderPermission();
    setPermission(nextPermission);
    schedulerRef.current?.schedule(reminderEvents);
  };

  const dismiss = (key: string) => {
    setFallbacks((current) => current.filter((item) => item.key !== key));
  };

  const statusLabel = permission === "granted"
    ? "Notifications on"
    : permission === "default"
      ? "Notifications optional"
      : "In-app reminders";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white/70 p-3 text-sm dark:border-white/10 dark:bg-zinc-900/60">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
            {permission === "granted" ? <Bell /> : <BellOff />}
          </span>
          <div>
            <p className="font-semibold text-slate-800 dark:text-zinc-100">Reminders</p>
            <p className="text-xs text-muted-foreground">{statusLabel}</p>
          </div>
        </div>
        {permission === "default" ? (
          <Button type="button" size="sm" variant="outline" onClick={handleEnableNotifications}>
            Enable
          </Button>
        ) : (
          <Badge variant="secondary">{reminderEvents.length}</Badge>
        )}
      </div>

      {permission !== "granted" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Timeora will show reminders here when browser notifications are unavailable or blocked.
        </p>
      ) : null}

      {fallbacks.length ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          {fallbacks.map((reminder) => (
            <div
              key={reminder.key}
              className="flex items-start justify-between gap-3 rounded-xl border border-violet-200/70 bg-violet-50 px-3 py-2 dark:border-violet-900/50 dark:bg-violet-950/30"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-violet-900 dark:text-violet-100">{reminder.title}</p>
                <p className="text-xs text-violet-700/80 dark:text-violet-300/80">{reminder.body}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Dismiss ${reminder.title} reminder`}
                onClick={() => dismiss(reminder.key)}
                className="shrink-0"
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
