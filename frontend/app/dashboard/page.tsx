"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Calendar as CalendarIcon, BrainCircuit, Download } from "lucide-react";
import { WeeklyCalendar } from "@/components/calendar/WeeklyCalendar";
import { EventDialog, EventData, ConflictData } from "@/components/calendar/EventDialog";
import {
  fetchApi,
  ApiError,
  type ApiEvent,
  type AssistantResult,
  restoreEvent,
  fetchEventsExpanded,
  exportIcs,
  executeAssistant,
} from "@/lib/api";
import { format } from "date-fns";
import { CommandBar } from "@/components/CommandBar";
import { InsightsPanel } from "@/components/InsightsPanel";
import { AvailabilityHeatmap } from "@/components/AvailabilityHeatmap";
import { motion } from "framer-motion";
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
  const [assistantConfirm, setAssistantConfirm] = useState<{
    eventId: string;
    action: "cancel" | "reschedule";
    title: string;
    newDate?: string;
    newTime?: string;
    message: string;
  } | null>(null);
  const [confirmingAssistant, setConfirmingAssistant] = useState(false);
  const [undoDelete, setUndoDelete] = useState<{ id: string; title: string } | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(INITIAL_DATE_RANGE);
  const [exporting, setExporting] = useState(false);
  const [insightsRefreshKey, setInsightsRefreshKey] = useState(0);

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
      alert(errorMessage(err, "Failed to export calendar"));
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
      duration_minutes: 60,
    });
    setConflictData(null);
    setIsDialogOpen(true);
  };

  const handleParsedNL = (
    parsedData: Partial<EventData>,
    meta?: { source?: string; warnings?: string[] }
  ) => {
    setSelectedEvent(parsedData);
    setConflictData(null);
    setAssistantToast(
      meta?.source === "fallback"
        ? "Parsed offline — please verify date and time before saving."
        : null
    );
    setIsDialogOpen(true);
  };

  const handleAssistant = (result: AssistantResult) => {
    if (result.requires_confirmation && result.result && typeof result.result === "object") {
      const r = result.result as Record<string, unknown>;
      const eventId = r.primary_event_id as string | undefined;
      if (eventId) {
        setAssistantConfirm({
          eventId,
          action: result.intent === "reschedule" ? "reschedule" : "cancel",
          title: (r.primary_title as string) || "Event",
          newDate: r.new_date as string | undefined,
          newTime: r.new_time as string | undefined,
          message: result.message,
        });
        setAssistantToast(null);
        return;
      }
    }

    setAssistantConfirm(null);
    setAssistantToast(result.message);
    if (result.intent === "find_slot" && Array.isArray(result.result) && result.result.length > 0) {
      const first = result.result[0] as { start_time?: string; reason?: string };
      if (first.start_time) {
        setAssistantToast(
          `${result.message} First slot: ${first.start_time}${first.reason ? ` — ${first.reason}` : ""}`
        );
      }
    }
  };

  const handleConfirmAssistant = async () => {
    if (!assistantConfirm) return;
    setConfirmingAssistant(true);
    try {
      const result = await executeAssistant({
        event_id: assistantConfirm.eventId,
        action: assistantConfirm.action,
        new_date: assistantConfirm.newDate,
        new_time: assistantConfirm.newTime,
      });
      const { eventId, title, action } = assistantConfirm;
      setAssistantConfirm(null);
      setAssistantToast(result.message);
      if (action === "cancel") {
        setUndoDelete({ id: eventId, title });
      }
      void loadEvents();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to execute command";
      alert(message);
    } finally {
      setConfirmingAssistant(false);
    }
  };

  const handleEventClick = (arg: EventClickArg) => {
    const { event } = arg;
    if (!event.start) return;
    const extendedProps = event.extendedProps as CalendarExtendedProps;
    setSelectedEvent({
      id: event.id,
      title: event.title,
      date: format(event.start, "yyyy-MM-dd"),
      start_time: format(event.start, "HH:mm:ss"),
      duration_minutes: extendedProps.duration_minutes || 60,
      participants: extendedProps.participants || "",
      recurrence_rule: extendedProps.recurrence_rule || null,
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
      await fetchApi(`/events/${event.id}`, {
        method: "PUT",
        body: JSON.stringify({
          date: format(event.start, "yyyy-MM-dd"),
          start_time: format(event.start, "HH:mm:ss"),
          duration_minutes: (end.getTime() - event.start.getTime()) / 60_000,
        }),
      });
      void loadEvents();
    } catch (err: unknown) {
      console.error(err);
      alert(errorMessage(err, "Failed to move event"));
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
          }),
        });
      }
      setConflictData(null);
      setIsDialogOpen(false);
      void loadEvents();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        const detail = err.data.detail;
        if (isConflictData(detail)) {
          setConflictData(detail);
        } else {
          alert("The selected time conflicts with another event");
        }
      } else {
        alert(errorMessage(err, "Failed to save event"));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (id: string, title?: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;
    setIsSaving(true);
    try {
      await fetchApi(`/events/${id}`, {
        method: "DELETE",
      });
      setIsDialogOpen(false);
      setUndoDelete({ id, title: title || "Event" });
      void loadEvents();
    } catch (err: unknown) {
      alert(errorMessage(err, "Failed to delete event"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoDelete = async () => {
    if (!undoDelete) return;
    try {
      await restoreEvent(undoDelete.id);
      setUndoDelete(null);
      void loadEvents();
    } catch (err: unknown) {
      alert(errorMessage(err, "Failed to restore event"));
    }
  };

  return (
    <div className="min-h-screen bg-[#fafbfc] dark:bg-zinc-950 flex flex-col relative overflow-hidden">
      {/* Premium Background Glows */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-violet-200/40 dark:bg-violet-900/20 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-200/30 dark:bg-indigo-900/20 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 dark:border-white/5 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-2xl px-6 py-4 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.03)] transition-all">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <CalendarIcon className="w-4.5 h-4.5 text-white" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-zinc-400">Timeora</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportIcs}
            disabled={exporting}
            className="hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-500 transition-colors font-medium rounded-xl"
          >
            <Download className="w-4 h-4 mr-2" />
            Export .ics
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-500 transition-colors font-medium rounded-xl">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-10 z-10">
        {assistantConfirm && (
          <motion.div
            role="region"
            aria-label="Assistant confirmation"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-4 rounded-xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/90 dark:bg-amber-950/30 px-4 py-3 text-sm shadow-sm"
          >
            <span className="text-amber-900 dark:text-amber-100">{assistantConfirm.message}</span>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                disabled={confirmingAssistant}
                onClick={() => setAssistantConfirm(null)}
                aria-label="Dismiss assistant confirmation"
                className="font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300"
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                disabled={confirmingAssistant}
                onClick={handleConfirmAssistant}
                aria-label="Confirm assistant action"
                className="font-semibold bg-amber-600 hover:bg-amber-700 text-white"
              >
                {confirmingAssistant ? "Working…" : "Confirm"}
              </Button>
            </div>
          </motion.div>
        )}
        {assistantToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-violet-200/60 dark:border-violet-900/40 bg-violet-50/80 dark:bg-violet-950/30 px-4 py-3 text-sm text-violet-800 dark:text-violet-200"
          >
            {assistantToast}
          </motion.div>
        )}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center mt-4"
        >
          <div 
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="group relative w-full max-w-2xl rounded-2xl bg-white/80 dark:bg-zinc-900/80 p-4 sm:p-5 cursor-text flex items-center shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(124,58,237,0.08)] transition-all duration-300 border border-slate-200/60 dark:border-white/10 hover:border-violet-300/50 backdrop-blur-xl overflow-hidden hover:-translate-y-0.5"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/0 via-violet-500/5 to-violet-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />
            <div className="p-2.5 bg-violet-100 dark:bg-violet-900/30 rounded-xl mr-4 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-inner">
              <BrainCircuit className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="flex-1 text-left text-slate-500 dark:text-slate-400 text-lg font-medium">
              Jadwalkan dengan AI...
            </span>
            <kbd className="hidden sm:inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 font-sans text-xs font-semibold text-slate-500 dark:text-slate-400 shadow-sm">
              ⌘ K
            </kbd>
          </div>
        </motion.div>
        
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
            <WeeklyCalendar 
              events={events}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              onEventDrop={handleEventDropOrResize}
              onEventResize={handleEventDropOrResize}
              onDatesChange={handleDatesChange}
            />
          </motion.div>
          <div className="space-y-6">
            <InsightsPanel
              refreshKey={insightsRefreshKey}
              onActionApplied={(message) => {
                setAssistantToast(message);
                setInsightsRefreshKey((k) => k + 1);
                void loadEvents();
              }}
            />
            <AvailabilityHeatmap refreshKey={insightsRefreshKey} />
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
      <CommandBar onParsed={handleParsedNL} onAssistant={handleAssistant} />
    </div>
  );
}
