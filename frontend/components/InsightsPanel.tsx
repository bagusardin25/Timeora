"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Brain, Clock, Lightbulb, Loader2, Sparkles } from "lucide-react";
import {
  applyBlockFocusTime,
  applySpreadLoad,
  fetchWeeklyInsights,
  InsightAction,
  WeeklyInsight,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface InsightsPanelProps {
  refreshKey?: number;
  onActionApplied?: (message: string) => void;
}

export function InsightsPanel({ refreshKey = 0, onActionApplied }: InsightsPanelProps) {
  const [insights, setInsights] = useState<WeeklyInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWeeklyInsights();
      setInsights(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchWeeklyInsights();
        if (!cancelled) setInsights(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load insights");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleAction = async (action: InsightAction) => {
    setApplying(action.type);
    setActionMessage(null);
    try {
      const result =
        action.type === "block_focus_time"
          ? await applyBlockFocusTime()
          : await applySpreadLoad();
      setActionMessage(result.message);
      onActionApplied?.(result.message);
      await loadInsights();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to apply action";
      setActionMessage(message);
    } finally {
      setApplying(null);
    }
  };

  const maxHours = insights
    ? Math.max(...DAY_ORDER.map((d) => insights.hours_per_day[d] ?? 0), 1)
    : 1;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="rounded-3xl bg-white/70 dark:bg-zinc-900/60 p-5 sm:p-6 backdrop-blur-2xl border border-slate-200/60 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] ring-1 ring-slate-100 dark:ring-white/5 h-fit"
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
          <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
          Weekly Insights
        </h2>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Analyzing your week…</span>
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-rose-600 dark:text-rose-400 py-4">{error}</p>
      )}

      {insights && !loading && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 dark:bg-zinc-800/50 p-3 border border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <Clock className="w-3 h-3" />
                Total hours
              </div>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                {insights.total_hours}
                <span className="text-sm font-medium text-slate-400 ml-0.5">h</span>
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-zinc-800/50 p-3 border border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <Brain className="w-3 h-3" />
                Fragmentation
              </div>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                {insights.fragmentation_score}
                <span className="text-sm font-medium text-slate-400 ml-0.5">%</span>
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Hours per day
            </p>
            <div className="flex items-end justify-between gap-1.5 h-28">
              {DAY_ORDER.map((day) => {
                const hours = insights.hours_per_day[day] ?? 0;
                const heightPct = (hours / maxHours) * 100;
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-medium text-slate-400 tabular-nums">
                      {hours > 0 ? hours : ""}
                    </span>
                    <div className="w-full h-20 flex items-end">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-violet-600 to-indigo-400 transition-all duration-500 min-h-[2px]"
                        style={{ height: `${Math.max(heightPct, hours > 0 ? 8 : 2)}%` }}
                        title={`${day}: ${hours}h`}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      {day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {insights.deep_work_blocks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Deep work blocks
              </p>
              <ul className="space-y-1.5">
                {insights.deep_work_blocks.slice(0, 3).map((block, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    {block.date} · {block.start}–{block.end} ({block.duration_minutes}m)
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 p-3.5">
            <div className="flex gap-2">
              <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                {insights.suggestion}
              </p>
            </div>
          </div>

          {(insights.actions?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Quick actions
              </p>
              {insights.actions!.map((action) => (
                <Button
                  key={action.type}
                  variant="outline"
                  size="sm"
                  disabled={applying !== null}
                  onClick={() => handleAction(action)}
                  className="w-full justify-start h-auto py-2.5 px-3 rounded-xl border-violet-200/70 dark:border-violet-900/40 hover:bg-violet-50 dark:hover:bg-violet-950/30 text-left"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-2 shrink-0 text-violet-600 dark:text-violet-400" />
                  <span className="flex flex-col items-start gap-0.5 min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {applying === action.type ? "Applying…" : action.label}
                    </span>
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 truncate w-full">
                      {action.description}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          )}

          {actionMessage && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-900/30 rounded-xl px-3 py-2">
              {actionMessage}
            </p>
          )}
        </div>
      )}
    </motion.aside>
  );
}
