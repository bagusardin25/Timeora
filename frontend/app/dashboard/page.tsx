"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Brain, Download, Settings, User } from "lucide-react";
import { WeeklyCalendar } from "@/components/calendar/WeeklyCalendar";
import { EventDialog, EventData, ConflictData } from "@/components/calendar/EventDialog";
import {
  fetchApi,
  ApiError,
  type ApiEvent,
  restoreEvent,
  fetchEventsExpanded,
  exportIcs,
  applyBlockFocusTime,
  applySpreadLoad,
} from "@/lib/api";
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
  const [events, setEvents] = useState<EventInput[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Partial<EventData> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const [assistantToast, setAssistantToast] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantContext, setAssistantContext] = useState<EventData | null>(null);
  const [undoDelete, setUndoDelete] = useState<{ id: string; title: string } | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(INITIAL_DATE_RANGE);
  const [exporting, setExporting] = useState(false);
  const [insightsRefreshKey, setInsightsRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"agenda" | "insights" | "availability">("agenda");
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [defaultDuration, setDefaultDuration] = useState(60);
  const [timezone, setTimezone] = useState<string>("");
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
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

  // Load user preferences from localStorage
  useEffect(() => {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const preferences = readStoredPreferences(detectedTimezone);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDefaultDuration(preferences.defaultDuration);
    if (preferences.timezone) {
      setTimezone(preferences.timezone);
    }
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
      console.error("Failed to load events", err);
    }
  }, [dateRange.from, dateRange.to]);

  const refreshAll = useCallback((from?: string, to?: string) => {
    void loadEvents(from, to);
    setInsightsRefreshKey((k) => k + 1);
  }, [loadEvents]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    fetchEventsExpanded(
      INITIAL_DATE_RANGE.from,
      INITIAL_DATE_RANGE.to,
    )
      .then((data) => {
        if (!cancelled) setEvents(toCalendarEvents(data));
      })
      .catch((error: unknown) => {
        console.error("Failed to load events", error);
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
      a.click();
      URL.revokeObjectURL(url);
      setAssistantToast("Calendar exported — timeora.ics downloaded.");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to export calendar"));
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
      const baseId = eventId.split("_")[0];
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
      id: event.id.split("_")[0],
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
      id: String(calEvent.id).split("_")[0],
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
      await fetchApi(`/events/${event.id.split("_")[0]}`, {
        method: "PUT",
        body: JSON.stringify({
          date: format(event.start, "yyyy-MM-dd"),
          start_time: format(event.start, "HH:mm:ss"),
          duration_minutes: (end.getTime() - event.start.getTime()) / 60_000,
        }),
      });
      refreshAll();
    } catch (err: unknown) {
      console.error(err);
      toast.error(errorMessage(err, "Failed to move event"));
      arg.revert();
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

  const handleDeleteEvent = async (id: string, title?: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;
    setIsSaving(true);
    try {
      const baseId = id.split("_")[0];
      await fetchApi(`/events/${baseId}`, {
        method: "DELETE",
      });
      setIsDialogOpen(false);
      setUndoDelete({ id: baseId, title: title || "Event" });
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
    <div className="min-h-screen bg-[#fafbfc] dark:bg-zinc-950 flex flex-col relative overflow-hidden">
      {/* Premium Background Glows */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-violet-200/40 dark:bg-violet-900/20 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-200/30 dark:bg-indigo-900/20 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 dark:border-white/5 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl px-4 sm:px-6 py-3 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.03)] transition-all">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <Image
            src="/logomark_lightmode.png"
            alt="Timeora Logo"
            width={474}
            height={403}
            className="block dark:hidden w-9 h-9 object-contain flex-shrink-0"
          />
          <Image
            src="/logomark.png"
            alt="Timeora Logo"
            width={627}
            height={502}
            className="hidden dark:block w-9 h-9 object-contain flex-shrink-0"
          />
          <div className="flex flex-col">
            <h1 className="text-base font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-zinc-400 leading-none">Timeora</h1>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-semibold mt-1">Your AI Companion</span>
          </div>
        </div>

        {/* Center: Command Bar Trigger (Desktop) - More prominent */}
        <div 
          onClick={() => openAssistant()}
          className="hidden md:flex items-center gap-3 bg-white dark:bg-zinc-900 border border-slate-200/70 dark:border-white/10 hover:border-violet-400/60 focus-within:border-violet-500 shadow-sm hover:shadow-md rounded-2xl px-4 py-2.5 w-full max-w-md cursor-pointer transition-all select-none group"
          role="button"
          aria-label="Open AI calendar chat (⌘K)"
        >
          <div className="flex items-center gap-2.5 flex-1">
            <Brain className="w-4 h-4 text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm text-slate-500 dark:text-zinc-400 font-medium">
              ⌘K  Jadwalkan, tanya jadwal, atau cari waktu kosong...
            </span>
          </div>
          <kbd className="hidden lg:flex text-[11px] font-mono text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/60 px-2 py-0.5 rounded-md border border-violet-200 dark:border-violet-800/60">
            ⌘K
          </kbd>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile AI Trigger Icon */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openAssistant()}
            className="md:hidden size-11 rounded-xl hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-500 transition-colors"
            aria-label="Open AI chat"
          >
            <Brain className="w-4 h-4 text-violet-500" />
          </Button>

          <div className="hidden lg:flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            AI Active
          </div>

          {/* Better Keyboard Shortcuts Hint */}
          <div className="hidden xl:flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500 bg-slate-100/60 dark:bg-zinc-800/60 px-2 py-1 rounded-lg border border-slate-200/50 dark:border-white/5">
            <kbd className="font-mono px-1 py-0.5 bg-white dark:bg-zinc-900 rounded text-[9px] border">⌘K</kbd>
            <span>command</span>
            <span className="mx-0.5">•</span>
            <kbd className="font-mono px-1 py-0.5 bg-white dark:bg-zinc-900 rounded text-[9px] border">drag</kbd>
            <span>calendar</span>
          </div>

          <ThemeToggle />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportIcs}
            disabled={exporting}
            className="hidden sm:flex hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-500 transition-colors font-medium rounded-xl"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button variant="ghost" size="sm" onClick={handleLogout} className="hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-500 transition-colors font-medium rounded-xl">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>

          {/* Profile Avatar with Dropdown */}
          <div className="relative" ref={profileRef}>
            <div
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white font-bold text-xs flex items-center justify-center border border-white/10 shadow-sm cursor-pointer select-none hover:scale-105 transition-transform shrink-0"
              title="Profile"
            >
              BA
            </div>

            {profileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-white/95 dark:bg-zinc-900/95 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl backdrop-blur-sm py-1 z-50 text-sm">
                <button
                  onClick={() => {
                    router.push("/profile");
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
                >
                  <User className="w-4 h-4" /> Profile
                </button>
                <button
                  onClick={() => {
                    router.push("/integrations");
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" /> Integrations
                </button>
                <button
                  onClick={() => {
                    handleExportIcs();
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Export Data
                </button>
                <div className="border-t border-slate-200 dark:border-white/10 my-1" />
                <button
                  onClick={() => {
                    handleLogout();
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Logout
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

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
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
                + Add Event
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBlockFocus}
                className="rounded-xl text-xs"
              >
                Block Focus Time
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFindFreeSlot}
                className="rounded-xl text-xs"
              >
                Find Free Slot
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSpreadLoad}
                className="rounded-xl text-xs"
              >
                Spread Load
              </Button>
            </div>

            {/* Empty State / First-time Guidance */}
            {events.length === 0 && (
              <div className="mb-4 rounded-2xl border border-dashed border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-5 text-center">
                <div className="mx-auto mb-2 w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-violet-600" />
                </div>
                <h3 className="font-semibold text-violet-700 dark:text-violet-300">No events yet</h3>
                <p className="text-sm text-violet-600/80 dark:text-violet-400 mt-1 mb-3">
                  Start by using the AI calendar chat (⌘K) or the buttons above.<br />
                  Try: “Jadwalkan meeting besok jam 10 selama 30 menit”
                </p>
                <Button size="sm" variant="outline" onClick={() => openAssistant()}>
                  Open AI Chat
                </Button>
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
          <div className="space-y-6">
            {/* Persistent "Right Now" Context + Sidebar Tabs */}
            <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold tracking-widest text-violet-600 dark:text-violet-400">RIGHT NOW</span>
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
                Gunakan ⌘K untuk jadwalkan cepat atau klik event di kalender.
              </div>
            </div>

            <NotificationCenter events={events} />

            {/* Sidebar Tab Control */}
            <div className="flex bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-2xl border border-slate-200/50 dark:border-white/5 relative">
              {[
                { id: "agenda", label: "Today" },
                { id: "insights", label: "Insights" },
                { id: "availability", label: "Availability" },
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
      />
      <Toaster richColors closeButton />
    </div>
  );
}
