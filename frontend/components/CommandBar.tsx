"use client";

import { useEffect, useState, useRef } from "react";
import { Sparkles, Command, Loader2 } from "lucide-react";
import { parseEventNL } from "@/lib/api";
import { EventData } from "./calendar/EventDialog";

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
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh]">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => !isLoading && setOpen(false)}
      />
      
      {/* Command Bar Dialog */}
      <div className="relative z-50 w-full max-w-2xl overflow-hidden rounded-xl border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <form onSubmit={handleSubmit} className="flex items-center px-4 py-4 border-b">
          {isLoading ? (
            <Loader2 className="mr-3 h-6 w-6 animate-spin text-primary" />
          ) : (
            <Sparkles className="mr-3 h-6 w-6 text-primary" />
          )}
          <input
            ref={inputRef}
            className="flex h-12 w-full rounded-md bg-transparent text-lg outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Jadwalkan meeting dengan tim besok jam 2 siang..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
          <div className="ml-4 flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            <Command className="h-3 w-3" />
            <span>Enter</span>
          </div>
        </form>

        {error && (
          <div className="px-4 py-3 text-sm text-destructive bg-destructive/10">
            {error}
          </div>
        )}

        <div className="px-4 py-3 text-sm text-muted-foreground flex justify-between bg-muted/30">
          <span>
            Gunakan natural language (AI) untuk membuat jadwal secara otomatis.
          </span>
          <span>Esc untuk batal</span>
        </div>
      </div>
    </div>
  );
}
