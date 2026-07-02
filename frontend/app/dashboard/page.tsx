"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Calendar as CalendarIcon, BrainCircuit } from "lucide-react";
import { WeeklyCalendar } from "@/components/calendar/WeeklyCalendar";
import { EventDialog, EventData, ConflictData } from "@/components/calendar/EventDialog";
import { fetchApi, ApiError } from "@/lib/api";
import { format } from "date-fns";
import { CommandBar } from "@/components/CommandBar";
import { motion } from "framer-motion";

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Partial<EventData> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
    } else {
      loadEvents();
    }
  }, [router]);

  const loadEvents = async () => {
    try {
      const data = await fetchApi("/events");
      const formattedEvents = data.map((e: any) => {
        const startDate = new Date(`${e.date}T${e.start_time}`);
        const endDate = new Date(startDate.getTime() + e.duration_minutes * 60000);
        return {
          id: e.id,
          title: e.title,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          extendedProps: {
            duration_minutes: e.duration_minutes,
            participants: e.participants,
          }
        };
      });
      setEvents(formattedEvents);
    } catch (err) {
      console.error("Failed to load events", err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.push("/");
  };

  const handleDateClick = (arg: any) => {
    const clickedDate = arg.date;
    setSelectedEvent({
      date: format(clickedDate, "yyyy-MM-dd"),
      start_time: format(clickedDate, "HH:mm:ss"),
      duration_minutes: 60,
    });
    setConflictData(null);
    setIsDialogOpen(true);
  };

  const handleParsedNL = (parsedData: Partial<EventData>) => {
    setSelectedEvent(parsedData);
    setConflictData(null);
    setIsDialogOpen(true);
  };

  const handleEventClick = (arg: any) => {
    const { event } = arg;
    setSelectedEvent({
      id: event.id,
      title: event.title,
      date: format(event.start, "yyyy-MM-dd"),
      start_time: format(event.start, "HH:mm:ss"),
      duration_minutes: event.extendedProps.duration_minutes,
      participants: event.extendedProps.participants,
    });
    setConflictData(null);
    setIsDialogOpen(true);
  };

  const handleEventDropOrResize = async (arg: any) => {
    const { event } = arg;
    try {
      await fetchApi(`/events/${event.id}`, {
        method: "PUT",
        body: JSON.stringify({
          date: format(event.start, "yyyy-MM-dd"),
          start_time: format(event.start, "HH:mm:ss"),
          duration_minutes: (event.end.getTime() - event.start.getTime()) / 60000
        }),
      });
      loadEvents();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to move event (Conflict?)");
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
             participants: data.participants
          }),
        });
      } else {
        await fetchApi("/events", {
          method: "POST",
          body: JSON.stringify(data),
        });
      }
      setConflictData(null);
      setIsDialogOpen(false);
      loadEvents();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictData(err.data.detail);
      } else {
        alert(err.message || "Failed to save event");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;
    setIsSaving(true);
    try {
      await fetchApi(`/events/${id}`, {
        method: "DELETE",
      });
      setIsDialogOpen(false);
      loadEvents();
    } catch (err: any) {
      alert(err.message || "Failed to delete event");
    } finally {
      setIsSaving(false);
    }
  };

  if (!mounted) return null;

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
        <Button variant="ghost" size="sm" onClick={handleLogout} className="hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-500 transition-colors font-medium rounded-xl">
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-10 z-10">
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
          />
        </motion.div>
      </main>

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
      <CommandBar onParsed={handleParsedNL} />
    </div>
  );
}
