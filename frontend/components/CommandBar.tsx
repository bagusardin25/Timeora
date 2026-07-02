"use client";

import { useEffect, useState, useRef } from "react";
import { Sparkles, Command, Loader2 } from "lucide-react";
import { parseEventNL } from "@/lib/api";
import { EventData } from "./calendar/EventDialog";
import { motion, AnimatePresence } from "framer-motion";

interface CommandBarProps {
  onParsed: (data: Partial<EventData>) => void;
}

export function CommandBar({ onParsed }: CommandBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await parseEventNL(query);
      onParsed(result);
      setOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to parse command");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm"
            onClick={() => !isLoading && setOpen(false)}
          />
          
          {/* Command Bar Dialog */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, type: "spring", bounce: 0.3 }}
            className="relative z-50 w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 glass bg-white/70 dark:bg-zinc-900/80 shadow-2xl backdrop-blur-2xl"
          >
            {/* Animated Glow Border if loading */}
            {isLoading && (
              <motion.div 
                className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              />
            )}

            <form onSubmit={handleSubmit} className="flex items-center px-4 py-4 border-b border-zinc-200/50 dark:border-white/5">
              {isLoading ? (
                <Loader2 className="mr-3 h-6 w-6 animate-spin text-primary" />
              ) : (
                <Sparkles className="mr-3 h-6 w-6 text-primary" />
              )}
              <input
                ref={inputRef}
                className="flex h-12 w-full rounded-md bg-transparent text-lg outline-none placeholder:text-zinc-500 dark:placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 text-zinc-900 dark:text-zinc-100 font-medium"
                placeholder="Jadwalkan meeting dengan tim besok jam 2 siang..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isLoading}
              />
              <div className="ml-4 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-200/50 dark:bg-zinc-800/50 px-2 py-1 rounded-md border border-zinc-300/50 dark:border-white/10">
                <Command className="h-3 w-3" />
                <span>Enter</span>
              </div>
            </form>

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="px-4 py-3 text-sm text-red-500 bg-red-100/50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-900/50"
              >
                {error}
              </motion.div>
            )}

            <div className="px-4 py-3 text-[13px] text-zinc-500 dark:text-zinc-400 flex justify-between bg-zinc-50/50 dark:bg-black/20">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary/70" />
                AI will understand natural language
              </span>
              <span>Esc to cancel</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
