"use client";

import { useCallback, useEffect, useState, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Brain, Download, Settings, User } from "lucide-react";
import { WeeklyCalendar } from "@/components/calendar/WeeklyCalendar";
import { EventDialog, EventData, ConflictData } from "@/components/calendar/EventDialog";
import { DeleteConfirmDialog } from "@/components/calendar/DeleteConfirmDialog";
import {
  fetchApi,
  ApiError,
  type ApiEvent,
  restoreEvent,
  fetchEventsExpanded,
  exportIcs,
  applyBlockFocusTime,
  applySpreadLoad,
  API_BASE_URL,
  API_CLIENT_BUILD,
  isUnauthorizedError,
} from "@/lib/api";
import { getAccountInitials, getTokenDisplayName, getTokenEmail, hasAuthSession } from "@/lib/session";
import { format } from "date-fns";
import { callAssistant } from "@/lib/api";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { InsightsPanel } from "@/components/InsightsPanel";
import { AvailabilityHeatmap } from "@/components/AvailabilityHeatmap";
import { TodayAgenda } from "@/components/TodayAgenda";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/i18n-provider";
import { baseEventId } from "@/lib/eventIds";
import { readStoredPreferences } from "@/lib/preferences";
import { motion, AnimatePresence } from "framer-motion";
import type {
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type {
  DateClickArg,
  EventResizeDoneArg,
} from "@fullcalendar/interaction";

type DateRange = { from: string; to: string };

type CalendarExtendedProps = {
  duration_minutes?: number;
  participants?: string;
  recurrence_rule?: string | null;
  category?: string | null;
  description?: string;
  location_url?: string | null;
  priority?: "low" | "normal" | "important";
  tags?: string[];
  reminder_minutes?: number | null;
};

function initialDateRange(): DateRange {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 14);
  const to = new Date(today);
  to.setDate(to.getDate() + 60);
  return {
    from: format(from, "yyyy-MM-dd"),
    to: format(to, "yyyy-MM-dd"),
  };
}

const INITIAL_DATE_RANGE = initialDateRange();

function toCalendarEvents(events: ApiEvent[]): EventInput[] {
  return events.map((event) => {
    const startDate = new Date(`${event.date}T${event.start_time}`);
    const endDate = new Date(
      startDate.getTime() + event.duration_minutes * 60_000,
    );
    return {
      id: event.id,
      title: event.title,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      extendedProps: {
        duration_minutes: event.duration_minutes,
        participants: event.participants || "",
        recurrence_rule: event.recurrence_rule || null,
        category: event.category || null,
        description: event.description || "",
        location_url: event.location_url || null,
        priority: event.priority || "normal",
        tags: event.tags || [],
        reminder_minutes: event.reminder_minutes ?? null,
      },
    };
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isConflictData(value: unknown): value is ConflictData {
  if (typeof value !== "object" || value === null) return false;
  const detail = value as Record<string, unknown>;
  return (
    typeof detail.message === "string"
    && typeof detail.conflicting_event === "string"
    && Array.isArray(detail.alternatives)
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [events, setEvents] = useState<EventInput[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Partial<EventData> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const [assistantToast, setAssistantToast] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantContext, setAssistantContext] = useState<EventData | null>(null);
  const [undoDelete, setUndoDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; title?: string } | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(INITIAL_DATE_RANGE);
  const [exporting, setExporting] = useState(false);
  const [insightsRefreshKey, setInsightsRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"agenda" | "insights" | "availability">("agenda");
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [defaultDuration, setDefaultDuration] = useState(60);
  const [timezone, setTimezone] = useState<string>("");
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [accountInitials, setAccountInitials] = useState("?");
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Live clock for Right Now context (client-only to avoid hydration mismatch)
  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime(); // set on client mount
    const interval = setInterval(updateTime, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Timezone (client only)
  useEffect(() => {
    // Browser timezone is unavailable during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Load user preferences + account identity for avatar initials
  useEffect(() => {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const preferences = readStoredPreferences(detectedTimezone);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDefaultDuration(preferences.defaultDuration);
    if (preferences.timezone) {
      setTimezone(preferences.timezone);
    }

    const email = getTokenEmail();
    const displayName = getTokenDisplayName();
    setAccountLabel(displayName ?? email);
    setAccountInitials(getAccountInitials(displayName ?? email));
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadEvents = useCallback(async (
    from = dateRange.from,
    to = dateRange.to,
  ) => {
    try {
      const data = await fetchEventsExpanded(from, to);
      setEvents(toCalendarEvents(data));
    } catch (err) {
      // 401 clears session + AuthSessionWatcher → /login (duck-type: HMR breaks instanceof).
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      console.error("Failed to load events", err);
      toast.error(errorMessage(err, t("dashboard.loadEventsFailed")));
    }
  }, [dateRange.from, dateRange.to, router, t]);

  const refreshAll = useCallback((from?: string, to?: string) => {
    void loadEvents(from, to);
    setInsightsRefreshKey((k) => k + 1);
  }, [loadEvents]);

  useEffect(() => {
    // Access token alone is not enough — silent renew needs refresh_token.
    if (!hasAuthSession()) {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      router.replace("/login");
      return;
    }

    console.info(`[Timeora] API client ${API_CLIENT_BUILD} base=${API_BASE_URL}`);

    let cancelled = false;
    // Initial calendar window only; subsequent loads go through loadEvents/refreshAll.
    fetchEventsExpanded(INITIAL_DATE_RANGE.from, INITIAL_DATE_RANGE.to)
      .then((data) => {
        if (!cancelled) setEvents(toCalendarEvents(data));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isUnauthorizedError(error)) {
          router.replace("/login");
          return;
        }
        console.error("Failed to load events", error, { API_BASE_URL, API_CLIENT_BUILD });
        toast.error(errorMessage(error, "Failed to load events. Please try again."));
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    router.push("/");
  };

  const handleExportIcs = async () => {
    setExporting(true);
    try {
      const blob = await exportIcs();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "timeora.ics";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setAssistantToast(t("dashboard.exportSuccess"));
    } catch (err: unknown) {
      toast.error(errorMessage(err, t("dashboard.exportFailed")));
    } finally {
      setExporting(false);
    }
  };

  const handleDatesChange = (from: string, to: string) => {
    if (dateRange.from === from && dateRange.to === to) return;
    setDateRange({ from, to });
    void loadEvents(from, to);
  };

  const handleDateClick = (arg: DateClickArg) => {
    const clickedDate = arg.date;
    setSelectedEvent({
      date: format(clickedDate, "yyyy-MM-dd"),
      start_time: format(clickedDate, "HH:mm:ss"),
      duration_minutes: defaultDuration,
    });
    setConflictData(null);
    setIsDialogOpen(true);
  };

  const handleAddEventClick = () => {
    setSelectedEvent({
      date: format(new Date(), "yyyy-MM-dd"),
      start_time: "09:00:00",
      duration_minutes: defaultDuration,
    });
    setConflictData(null);
    setIsDialogOpen(true);
  };

  const handleBlockFocus = async () => {
    try {
      const result = await applyBlockFocusTime();
      setAssistantToast(result.message);
      refreshAll();
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to block focus time"));
    }
  };

  const handleSpreadLoad = async () => {
    try {
      const result = await applySpreadLoad();
      setAssistantToast(result.message);
      refreshAll();
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to spread load"));
    }
  };

  const handleFindFreeSlot = async () => {
    // Quick find slot using assistant
    try {
      const result = await callAssistant("cari waktu kosong 1 jam besok");
      if (result.intent === "find_slot") {
        setAssistantToast(result.message);
      } else {
        // fallback open command
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
      }
    } catch {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    }
  };

  const openAssistant = useCallback((context?: EventData | null) => {
    setAssistantContext(context ?? null);
    setAssistantOpen(true);
  }, []);

  const handleAssistantOpenChange = useCallback((open: boolean) => {
    setAssistantOpen(open);
    if (!open) setAssistantContext(null);
  }, []);

  const handleEventCategoryChange = async (eventId: string, category: string) => {
    try {
      const baseId = baseEventId(eventId);
      await fetchApi(`/events/${baseId}`, {
        method: "PUT",
        body: JSON.stringify({ category }),
      });
      refreshAll();
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to change category"));
    }
  };

  const handleEventClick = (arg: EventClickArg) => {
    const { event } = arg;
    if (!event.start) return;
    const extendedProps = event.extendedProps as CalendarExtendedProps;
    setSelectedEvent({
      id: baseEventId(event.id),
      title: event.title,
      date: format(event.start, "yyyy-MM-dd"),
      start_time: format(event.start, "HH:mm:ss"),
      duration_minutes: extendedProps.duration_minutes || 60,
      participants: extendedProps.participants || "",
      recurrence_rule: extendedProps.recurrence_rule || null,
      category: extendedProps.category || null,
      description: extendedProps.description || "",
      location_url: extendedProps.location_url || null,
      priority: extendedProps.priority || "normal",
      tags: extendedProps.tags || [],
      reminder_minutes: extendedProps.reminder_minutes ?? null,
    });
    setConflictData(null);
    setIsDialogOpen(true);
  };

  const handleAgendaEventClick = (eventId: string) => {
    const calEvent = events.find((e) => e.id === eventId);
    if (!calEvent || !calEvent.start) return;
    const rawStart = calEvent.start;
    const start = rawStart instanceof Date ? rawStart : new Date(rawStart as string | number);
    const ext = (calEvent.extendedProps || {}) as CalendarExtendedProps;
    setSelectedEvent({
      id: baseEventId(String(calEvent.id)),
      title: calEvent.title as string,
      date: format(start, "yyyy-MM-dd"),
      start_time: format(start, "HH:mm:ss"),
      duration_minutes: ext.duration_minutes || 60,
      participants: ext.participants || "",
      recurrence_rule: ext.recurrence_rule || null,
      category: ext.category || null,
      description: ext.description || "",
      location_url: ext.location_url || null,
      priority: ext.priority || "normal",
      tags: ext.tags || [],
      reminder_minutes: ext.reminder_minutes ?? null,
    });
    setConflictData(null);
    setIsDialogOpen(true);
  };

  const handleEventDropOrResize = async (
    arg: EventDropArg | EventResizeDoneArg,
  ) => {
    const { event } = arg;
    if (!event.start) {
      arg.revert();
      return;
    }
    const end = event.end || new Date(event.start.getTime() + 60 * 60_000);
    try {
      await fetchApi(`/events/${baseEventId(event.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          date: format(event.start, "yyyy-MM-dd"),
          start_time: format(event.start, "HH:mm:ss"),
          duration_minutes: (end.getTime() - event.start.getTime()) / 60_000,
        }),
      });
      refreshAll();
    } catch (err: unknown) {
      arg.revert();
      if (err instanceof ApiError && err.status === 409) {
        const detail = err.data?.detail;
        if (isConflictData(detail)) {
          toast.error(t("calendar.conflictWith", { title: detail.conflicting_event }));
        } else {
          toast.error(t("calendar.conflictTitle"));
        }
      } else {
        toast.error(errorMessage(err, "Failed to move event"));
      }
    }
  };

  const handleSaveEvent = async (data: EventData) => {
    setIsSaving(true);
    try {
      if (data.id) {
        await fetchApi(`/events/${data.id}`, {
          method: "PUT",
          body: JSON.stringify({
             title: data.title,
             date: data.date,
             start_time: data.start_time,
             duration_minutes: data.duration_minutes,
             participants: data.participants,
             recurrence_rule: data.recurrence_rule || null,
             category: data.category || null,
             description: data.description,
             location_url: data.location_url || null,
             priority: data.priority,
             tags: data.tags,
             reminder_minutes: data.reminder_minutes ?? null,
          }),
        });
      } else {
        await fetchApi("/events", {
          method: "POST",
          body: JSON.stringify({
            title: data.title,
            date: data.date,
            start_time: data.start_time,
            duration_minutes: data.duration_minutes,
            participants: data.participants,
            recurrence_rule: data.recurrence_rule || null,
            category: data.category || null,
            description: data.description,
            location_url: data.location_url || null,
            priority: data.priority,
            tags: data.tags,
            reminder_minutes: data.reminder_minutes ?? null,
          }),
        });
      }
      setConflictData(null);
      setIsDialogOpen(false);
      refreshAll();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        const detail = err.data.detail;
        if (isConflictData(detail)) {
          setConflictData(detail);
        } else {
          toast.error("The selected time conflicts with another event");
        }
      } else {
        toast.error(errorMessage(err, "Failed to save event"));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = (id: string, title?: string) => {
    setDeleteConfirmTarget({ id, title });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    setIsSaving(true);
    try {
      const baseId = baseEventId(deleteConfirmTarget.id);
      await fetchApi(`/events/${baseId}`, {
        method: "DELETE",
      });
      setIsDialogOpen(false);
      setDeleteConfirmTarget(null);
      setUndoDelete({ id: baseId, title: deleteConfirmTarget.title || "Event" });
      refreshAll();
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to delete event"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoDelete = async () => {
    if (!undoDelete) return;
    try {
      await restoreEvent(undoDelete.id);
      setUndoDelete(null);
      refreshAll();
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to restore event"));
    }
  };

  return (
    <div
      className={[
        "min-h-screen bg-[#fafbfc] dark:bg-zinc-950 flex flex-col relative overflow-x-hidden",
        // Desktop chat is a right dock — push content so sidebar (RIGHT NOW) is not covered.
        "transition-[padding] duration-300 ease-out",
        assistantOpen ? "md:pr-[var(--assistant-dock-width,400px)]" : "",
      ].join(" ")}
      style={
        {
          // Keep in sync with AssistantPanel desktop width.
          "--assistant-dock-width": "min(400px, 38vw)",
        } as CSSProperties
      }
    >
      {/* Premium Background Glows */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-violet-200/40 dark:bg-violet-900/20 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-200/30 dark:bg-indigo-900/20 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Header — keep lean: brand · AI search · theme · account */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 dark:border-white/5 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4 shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
        {/* Left: Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Image
            src="/logomark_lightmode.png"
            alt="Timeora Logo"
            width={474}
            height={403}
            className="block dark:hidden w-8 h-8 object-contain"
          />
          <Image
            src="/logomark.png"
            alt="Timeora Logo"
            width={627}
            height={502}
            className="hidden dark:block w-8 h-8 object-contain"
          />
          <h1 className="type-brand text-base bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-zinc-400">
            Timeora
          </h1>
        </div>

        {/* Center: AI command (primary action) */}
        <button
          type="button"
          onClick={() => openAssistant()}
          className="hidden md:flex min-w-0 flex-1 max-w-xl mx-auto items-center gap-2.5 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-zinc-900 px-3.5 py-2 text-left shadow-sm transition-all hover:border-violet-400/60 hover:shadow-md"
          aria-label={t("nav.openAiChat")}
        >
          <Brain className="w-4 h-4 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="truncate text-sm text-slate-500 dark:text-zinc-400">
            {t("nav.askCalendar")}
          </span>
          <kbd className="ml-auto hidden shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-mono text-[10px] text-violet-600 dark:border-violet-800/60 dark:bg-violet-950/60 dark:text-violet-400 sm:inline">
            ⌘K
          </kbd>
        </button>

        {/* Right: essentials only */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openAssistant()}
            className="md:hidden size-10 rounded-xl"
            aria-label={t("nav.openAiChatShort")}
          >
            <Brain className="w-4 h-4 text-violet-500" />
          </Button>

          <LanguageToggle compact />
          <ThemeToggle />

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-bold uppercase text-white shadow-sm transition-transform hover:scale-105"
              aria-label={accountLabel ? `${t("nav.accountMenu")}: ${accountLabel}` : t("nav.accountMenu")}
              title={accountLabel ?? t("nav.accountMenu")}
              aria-expanded={profileDropdownOpen}
            >
              {accountInitials}
            </button>

            {profileDropdownOpen && (
              <div className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-slate-200 bg-white/95 py-1 text-sm shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/95">
                {accountLabel ? (
                  <div className="border-b border-slate-200 px-4 py-2 dark:border-white/10">
                    <p className="truncate text-xs font-medium text-foreground">{accountLabel}</p>
                    <p className="text-[10px] text-muted-foreground">{t("nav.signedIn")}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    router.push("/profile");
                    setProfileDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
                >
                  <User className="w-4 h-4" /> {t("nav.profile")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    router.push("/integrations");
                    setProfileDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
                >
                  <Settings className="w-4 h-4" /> {t("nav.integrations")}
                </button>
                <button
                  type="button"
                  data-testid="export-ics-button"
                  disabled={exporting}
                  onClick={() => {
                    void handleExportIcs();
                    setProfileDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                >
                  <Download className="w-4 h-4" /> {t("nav.exportIcs")}
                </button>
                <div className="my-1 border-t border-slate-200 dark:border-white/10" />
                <button
                  type="button"
                  onClick={() => {
                    handleLogout();
                    setProfileDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                >
                  <LogOut className="w-4 h-4" /> {t("common.logout")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-10 z-10">
        {assistantToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-violet-200/60 dark:border-violet-900/40 bg-violet-50/80 dark:bg-violet-950/30 px-4 py-3 text-sm text-violet-800 dark:text-violet-200"
          >
            {assistantToast}
          </motion.div>
        )}

        
        {undoDelete && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-zinc-900/80 px-4 py-3 text-sm shadow-sm"
          >
            <span className="text-slate-600 dark:text-slate-300">
              &ldquo;{undoDelete.title}&rdquo; deleted
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndoDelete}
              className="font-semibold text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30"
            >
              Undo
            </Button>
          </motion.div>
        )}

        <div
          className={[
            "grid grid-cols-1 gap-6 items-start",
            // When chat is open, drop the right column below xl so calendar + chat fit;
            // at 2xl keep sidebar beside calendar (content already padded for the dock).
            assistantOpen
              ? "xl:grid-cols-1 2xl:grid-cols-[1fr_300px]"
              : "xl:grid-cols-[1fr_320px]",
          ].join(" ")}
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-3xl bg-white/70 dark:bg-zinc-900/60 p-4 sm:p-6 lg:p-8 backdrop-blur-2xl border border-slate-200/60 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] ring-1 ring-slate-100 dark:ring-white/5"
          >
            {/* Quick Actions Bar */}
            <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-3">
              <Button
                size="sm"
                onClick={handleAddEventClick}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 text-xs"
              >
                {t("dashboard.addEvent")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBlockFocus}
                className="rounded-xl text-xs"
              >
                {t("dashboard.blockFocus")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFindFreeSlot}
                className="rounded-xl text-xs"
              >
                {t("dashboard.findFreeSlot")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSpreadLoad}
                className="rounded-xl text-xs"
              >
                {t("dashboard.spreadLoad")}
              </Button>
            </div>

            {/* Compact empty state — no large promo card */}
            {events.length === 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900/50">
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {t("empty.noEvents")}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    onClick={handleAddEventClick}
                  >
                    {t("empty.addEvent")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg text-xs text-violet-600 hover:bg-violet-50 hover:text-violet-700 dark:text-violet-400 dark:hover:bg-violet-500/10"
                    onClick={() => openAssistant()}
                  >
                    <Brain className="mr-1 h-3.5 w-3.5" />
                    {t("empty.ai")}
                    <kbd className="ml-1.5 hidden rounded border border-violet-200/80 px-1 font-mono text-[10px] opacity-70 sm:inline dark:border-violet-800">
                      ⌘K
                    </kbd>
                  </Button>
                </div>
              </div>
            )}

            <WeeklyCalendar 
              events={events}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              onEventDrop={handleEventDropOrResize}
              onEventResize={handleEventDropOrResize}
              onDatesChange={handleDatesChange}
              onAddEventClick={handleAddEventClick}
              onEventCategoryChange={handleEventCategoryChange}
              onEventEdit={handleAgendaEventClick}
              onEventDelete={(event) => {
                if (event.id) void handleDeleteEvent(event.id, event.title);
              }}
              onEventAskAI={(event) => openAssistant(event)}
            />
          </motion.div>
          <div
            className={[
              "space-y-6",
              // Avoid a cramped triple column (calendar | sidebar | chat) on mid widths.
              assistantOpen ? "hidden 2xl:block" : "",
            ].join(" ")}
          >
            {/* Persistent "Right Now" Context + Sidebar Tabs */}
            <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold tracking-widest text-violet-600 dark:text-violet-400">{t("dashboard.rightNow")}</span>
                <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                  {currentTime 
                    ? currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) 
                    : '--:--'}
                </span>
              </div>
              {timezone && (
                <div className="text-[9px] text-slate-400 dark:text-slate-500 mb-1">
                  {timezone.replace(/_/g, " ")}
                </div>
              )}
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t("dashboard.rightNowHint")}
              </div>
            </div>

            <NotificationCenter events={events} />

            {/* Sidebar Tab Control */}
            <div className="flex bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-2xl border border-slate-200/50 dark:border-white/5 relative">
              {[
                { id: "agenda", label: t("dashboard.today") },
                { id: "insights", label: t("dashboard.insights") },
                { id: "availability", label: t("dashboard.availability") },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as "agenda" | "insights" | "availability")}
                    className="relative flex-1 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer select-none text-center"
                    style={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeSidebarTabIndicator"
                        className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-xl shadow-sm z-0"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Sidebar Content Area */}
            <div className="relative min-h-[380px]">
              <AnimatePresence mode="wait">
                {activeTab === "agenda" && (
                  <motion.div
                    key="agenda"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                  >
                    <TodayAgenda
                      events={events}
                      onEventClick={handleAgendaEventClick}
                    />
                  </motion.div>
                )}
                {activeTab === "insights" && (
                  <motion.div
                    key="insights"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                  >
                    <InsightsPanel
                      refreshKey={insightsRefreshKey}
                      onActionApplied={(message) => {
                        setAssistantToast(message);
                        refreshAll();
                      }}
                    />
                  </motion.div>
                )}
                {activeTab === "availability" && (
                  <motion.div
                    key="availability"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AvailabilityHeatmap refreshKey={insightsRefreshKey} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      {isDialogOpen && (
        <EventDialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setConflictData(null);
          }}
          initialData={selectedEvent}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          isSaving={isSaving}
          conflictData={conflictData}
          onClearConflict={() => setConflictData(null)}
        />
      )}

      {/* Mobile Floating Action Button - High visibility for Command Bar */}
      <button
        onClick={() => openAssistant()}
        className="md:hidden fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.5rem+env(safe-area-inset-right))] z-50 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl shadow-violet-500/30 flex items-center justify-center active:scale-95 transition-all hover:brightness-110"
        aria-label="Buka AI chat"
      >
        <Brain className="w-6 h-6" />
      </button>

      <AssistantPanel
        open={assistantOpen}
        onOpenChange={handleAssistantOpenChange}
        onEventsChanged={() => refreshAll()}
        contextEvent={assistantContext}
        onClearContext={() => setAssistantContext(null)}
        onViewCalendar={() => {
          refreshAll();
          setAssistantOpen(false);
        }}
      />
      <DeleteConfirmDialog
        open={!!deleteConfirmTarget}
        onOpenChange={(open) => { if (!open) setDeleteConfirmTarget(null); }}
        eventTitle={deleteConfirmTarget?.title}
        onConfirm={confirmDelete}
        isDeleting={isSaving}
      />
      <Toaster richColors closeButton />
    </div>
  );
}
