"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { fetchAvailabilityHeatmap, AvailabilityHeatmapData } from "@/lib/api";
import { motion } from "framer-motion";

interface AvailabilityHeatmapProps {
  refreshKey?: number;
}

function scoreColor(score: number): string {
  if (score >= 0.99) return "bg-emerald-500/90";
  if (score >= 0.75) return "bg-emerald-400/70";
  if (score >= 0.5) return "bg-amber-400/80";
  if (score >= 0.25) return "bg-orange-400/80";
  return "bg-rose-500/85";
}

function formatHour(hour: number): string {
  if (hour === 12) return "12p";
  if (hour > 12) return `${hour - 12}p`;
  return `${hour}a`;
}

export function AvailabilityHeatmap({ refreshKey = 0 }: AvailabilityHeatmapProps) {
  const [data, setData] = useState<AvailabilityHeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAvailabilityHeatmap();
        if (!cancelled) setData(result);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load availability");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const cellMap = new Map<string, number>();
  data?.cells.forEach((cell) => {
    cellMap.set(`${cell.day}-${cell.hour}`, cell.score);
  });

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-3xl bg-white/70 dark:bg-zinc-900/60 p-5 sm:p-6 backdrop-blur-2xl border border-slate-200/60 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] ring-1 ring-slate-100 dark:ring-white/5 h-fit"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-100 dark:bg-teal-900/30">
            <CalendarRange className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Availability
          </h2>
        </div>
        {data && (
          <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 px-2 py-1 rounded-lg">
            {data.availability_pct}% free
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Mapping free slots…</span>
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-rose-600 dark:text-rose-400 py-4">{error}</p>
      )}

      {data && !loading && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <div className="min-w-[280px]">
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `36px repeat(${data.days.length}, minmax(0, 1fr))` }}
              >
                <div />
                {data.days.map((day) => (
                  <div
                    key={day}
                    className="text-[10px] font-semibold text-center text-slate-500 dark:text-slate-400"
                  >
                    {day}
                  </div>
                ))}

                {data.hours.map((hour) => (
                  <div key={`row-${hour}`} className="contents">
                    <div className="text-[10px] font-medium text-slate-400 text-right pr-1 self-center">
                      {formatHour(hour)}
                    </div>
                    {data.days.map((day) => {
                      const score = cellMap.get(`${day}-${hour}`) ?? 1;
                      return (
                        <div
                          key={`${day}-${hour}`}
                          title={`${day} ${formatHour(hour)}: ${Math.round(score * 100)}% free`}
                          className={`h-4 rounded-sm ${scoreColor(score)} transition-colors`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <span>Busy</span>
            <div className="flex gap-0.5 flex-1">
              <div className="h-2 flex-1 rounded-sm bg-rose-500/85" />
              <div className="h-2 flex-1 rounded-sm bg-orange-400/80" />
              <div className="h-2 flex-1 rounded-sm bg-amber-400/80" />
              <div className="h-2 flex-1 rounded-sm bg-emerald-400/70" />
              <div className="h-2 flex-1 rounded-sm bg-emerald-500/90" />
            </div>
            <span>Free</span>
          </div>

          {data.best_slots.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Best windows
              </p>
              <ul className="space-y-1.5">
                {data.best_slots.map((slot, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                    {slot.day} · {formatHour(slot.start_hour)}–{formatHour(slot.end_hour)} ({slot.duration_hours}h free)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </motion.aside>
  );
}