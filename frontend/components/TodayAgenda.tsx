"use client";

import { useEffect, useMemo, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import {
  Sun,
  Sunrise,
  Sunset,
  Moon,
  CalendarCheck2,
  Clock,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getCategoryConfig } from "@/lib/categories";
import type { EventInput } from "@fullcalendar/core";

interface TodayAgendaProps {
  events: EventInput[];
  onEventClick?: (eventId: string) => void;
}

type TodayEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  category?: string | null;
  duration_minutes: number;
};

function getGreeting(hour: number): { text: string; icon: typeof Sun } {
  if (hour < 6) return { text: "Selamat malam", icon: Moon };
  if (hour < 11) return { text: "Selamat pagi", icon: Sunrise };
  if (hour < 15) return { text: "Selamat siang", icon: Sun };
  if (hour < 18) return { text: "Selamat sore", icon: Sunset };
  return { text: "Selamat malam", icon: Moon };
}

function formatTimeRange(start: Date, end: Date): string {
  return `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`;
}

function formatCountdown(minutes: number): string {
  if (minutes < 1) return "dimulai sekarang";
  if (minutes < 60) return `${minutes} menit lagi`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} jam lagi`;
  return `${hours}j ${mins}m lagi`;
}

function dayBounds(day: Date): { start: Date; end: Date } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function overlapsDay(start: Date, end: Date, day: Date): boolean {
  const bounds = dayBounds(day);
  return start < bounds.end && end > bounds.start;
}

export function TodayAgenda({ events, onEventClick }: TodayAgendaProps) {
  const [now, setNow] = useState(new Date());

  // Tick every minute for countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayEvents = useMemo((): TodayEvent[] => {
    return events
      .filter((e) => {
        if (!e.start) return false;
        const raw = e.start;
        const start = raw instanceof Date ? raw : new Date(raw as string | number);
        if (Number.isNaN(start.getTime())) return false;
        const rawEnd = e.end;
        const ext = (e.extendedProps || {}) as Record<string, unknown>;
        const durationMinutes =
          typeof ext.duration_minutes === "number" && Number.isFinite(ext.duration_minutes)
            ? ext.duration_minutes
            : 60;
        const end = rawEnd
          ? rawEnd instanceof Date ? rawEnd : new Date(rawEnd as string | number)
          : new Date(start.getTime() + durationMinutes * 60_000);
        if (Number.isNaN(end.getTime())) return false;
        return overlapsDay(start, end, now);
      })
      .map((e) => {
        const rawS = e.start!;
        const start = rawS instanceof Date ? rawS : new Date(rawS as string | number);
        const ext = (e.extendedProps || {}) as Record<string, unknown>;
        const configuredDuration =
          typeof ext.duration_minutes === "number" && Number.isFinite(ext.duration_minutes)
            ? ext.duration_minutes
            : null;
        const rawE = e.end;
        const end = rawE
          ? rawE instanceof Date ? rawE : new Date(rawE as string | number)
          : new Date(start.getTime() + (configuredDuration ?? 60) * 60_000);
        return {
          id: e.id as string,
          title: e.title as string,
          start,
          end,
          category: ext.category as string | null | undefined,
          duration_minutes: configuredDuration ?? differenceInMinutes(end, start),
        };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, now]);

  const nextEvent = useMemo(() => {
    return todayEvents.find((e) => e.end > now);
  }, [todayEvents, now]);

  const minutesUntilNext = useMemo(() => {
    if (!nextEvent) return 0;
    const diff = differenceInMinutes(nextEvent.start, now);
    return Math.max(0, diff);
  }, [nextEvent, now]);

  const currentEvent = useMemo(() => {
    return todayEvents.find((e) => e.start <= now && e.end > now);
  }, [todayEvents, now]);

  const totalScheduledHours = useMemo(() => {
    return todayEvents.reduce((acc, e) => acc + e.duration_minutes, 0) / 60;
  }, [todayEvents]);

  const { text: greeting, icon: GreetingIcon } = getGreeting(now.getHours());

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl bg-white/70 dark:bg-zinc-900/60 backdrop-blur-2xl border border-slate-200/60 dark:border-white/10 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.05)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <GreetingIcon className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {greeting}
          </span>
        </div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">
          {format(now, "EEEE, d MMMM")}
        </h2>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <CalendarCheck2 className="w-3.5 h-3.5" />
            {todayEvents.length} event{todayEvents.length !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {totalScheduledHours.toFixed(1)}h scheduled
          </span>
        </div>
      </div>

      {/* Current Event Banner */}
      <AnimatePresence>
        {currentEvent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mb-2"
          >
            <div
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 dark:from-violet-500/20 dark:to-indigo-500/20 border border-violet-200/50 dark:border-violet-800/30 cursor-pointer hover:from-violet-500/15 hover:to-indigo-500/15 transition-colors"
              onClick={() => onEventClick?.(currentEvent.id)}
            >
              <div className="relative flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  Happening now
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                  {currentEvent.title}
                </p>
              </div>
              <span className="text-[11px] text-violet-600 dark:text-violet-400 font-medium whitespace-nowrap">
                ends {format(currentEvent.end, "HH:mm")}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next Up Banner */}
      <AnimatePresence>
        {nextEvent && !currentEvent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mb-2"
          >
            <div
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20 border border-amber-200/50 dark:border-amber-800/30 cursor-pointer hover:from-amber-500/15 hover:to-orange-500/15 transition-colors"
              onClick={() => onEventClick?.(nextEvent.id)}
            >
              <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Next up
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                  {nextEvent.title}
                </p>
              </div>
              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                {formatCountdown(minutesUntilNext)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event List */}
      <div className="px-4 pb-4">
        {todayEvents.length === 0 ? (
          <div className="text-center py-6 text-slate-400 dark:text-slate-500">
            <CalendarCheck2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No events today</p>
            <p className="text-xs mt-0.5">Use ⌘K to schedule something</p>
          </div>
        ) : (
          <div className="space-y-1">
            {todayEvents.map((event, idx) => {
              const cat = getCategoryConfig(event.category);
              const isPast = event.end < now;
              const isCurrent = event.start <= now && event.end > now;

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => onEventClick?.(event.id)}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-white/5 ${
                    isPast ? "opacity-50" : ""
                  } ${isCurrent ? "bg-violet-50/50 dark:bg-violet-950/20" : ""}`}
                >
                  {/* Category dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cat.dot} ${
                    isCurrent ? "animate-pulse ring-2 ring-violet-300 dark:ring-violet-700" : ""
                  }`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      isPast
                        ? "text-slate-400 dark:text-slate-500 line-through"
                        : "text-slate-700 dark:text-slate-200"
                    }`}>
                      {event.title}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {formatTimeRange(event.start, event.end)}
                      <span className="mx-1">·</span>
                      {event.duration_minutes}m
                    </p>
                  </div>

                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
