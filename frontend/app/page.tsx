"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { WeeklyCalendar } from "@/components/calendar/WeeklyCalendar";
import { EventDialog, EventData } from "@/components/calendar/EventDialog";
import { fetchApi } from "@/lib/api";
import { format } from "date-fns";
import { CommandBar } from "@/components/CommandBar";
import { Sparkles } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Partial<EventData> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      // Map backend EventResponse to FullCalendar format
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
    setIsDialogOpen(true);
  };

  const handleParsedNL = (parsedData: Partial<EventData>) => {
    setSelectedEvent(parsedData);
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
      // Refresh to ensure server state (including conflict rejection) is reflected
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
      setIsDialogOpen(false);
      loadEvents();
    } catch (err: any) {
      alert(err.message || "Failed to save event");
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <header className="border-b bg-white dark:bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Timeora</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        <div 
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="rounded-xl border bg-white dark:bg-zinc-900 p-4 text-zinc-500 cursor-text flex items-center hover:bg-zinc-50 transition-colors shadow-sm"
        >
          <Sparkles className="w-5 h-5 mr-3 text-primary" />
          <span className="flex-1 text-left">Jadwalkan sesuatu dengan AI... (ketik "meeting besok jam 2")</span>
          <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border bg-muted px-2 font-mono text-[11px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
        
        <WeeklyCalendar 
          events={events}
          onDateClick={handleDateClick}
          onEventClick={handleEventClick}
          onEventDrop={handleEventDropOrResize}
          onEventResize={handleEventDropOrResize}
        />
      </main>

      <EventDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        initialData={selectedEvent}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        isSaving={isSaving}
      />
      <CommandBar onParsed={handleParsedNL} />
    </div>
  );
}
