"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Calendar as CalendarIcon, Sparkles } from "lucide-react";
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
      router.push("/login");
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
    router.push("/login");
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col relative overflow-hidden">
      {/* Subtle Background Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-primary/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-zinc-200/50 dark:border-white/5 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-xl px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary to-violet-500 flex items-center justify-center shadow-lg shadow-primary/20">
            <CalendarIcon className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-500 dark:from-white dark:to-zinc-400">Timeora</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="hover:bg-red-500/10 hover:text-red-500 transition-colors">
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8 z-10">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex justify-center"
        >
          <div 
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="group relative w-full max-w-2xl rounded-2xl bg-white/60 dark:bg-zinc-900/60 p-4 cursor-text flex items-center shadow-sm hover:shadow-md transition-all duration-300 border border-zinc-200/50 dark:border-white/10 hover:border-primary/50 backdrop-blur-md overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />
            <div className="p-2 bg-primary/10 rounded-xl mr-3 group-hover:scale-110 transition-transform duration-300">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <span className="flex-1 text-left text-zinc-500 dark:text-zinc-400 text-lg">
              Jadwalkan sesuatu dengan AI...
            </span>
            <kbd className="hidden sm:inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-zinc-800 px-2 font-mono text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass rounded-2xl bg-white/40 dark:bg-zinc-900/40 p-2 sm:p-4 backdrop-blur-md border border-zinc-200/50 dark:border-white/5"
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
