"use client";

import { useEffect, useState, useRef } from "react";
import { Sparkles, Command, Loader2, Mic, MicOff } from "lucide-react";
import { parseEventNL, callAssistant, AssistantResult } from "@/lib/api";
import { EventData } from "./calendar/EventDialog";
import { motion, AnimatePresence } from "framer-motion";

interface CommandBarProps {
  onParsed: (data: Partial<EventData>, meta?: { source?: string; warnings?: string[] }) => void;
  onAssistant?: (result: AssistantResult) => void;
}

export function CommandBar({ onParsed, onAssistant }: CommandBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) {
          setOpen(false);
        } else {
          setQuery("");
          setError(null);
          setAssistantMessage(null);
          setOpen(true);
        }
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  // Clean up recognition instance when unmounted
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        (recognitionRef.current as { stop: () => void }).stop();
      }
    };
  }, []);

  // Safeguard: Stop listening when modal is closed
  useEffect(() => {
    if (!open && isListening) {
      (recognitionRef.current as { stop: () => void })?.stop();
    }
  }, [open, isListening]);

  const startListening = () => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
       (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setError("Browser Anda tidak mendukung Web Speech API (Speech Recognition).");
      return;
    }

    if (isListening) {
      (recognitionRef.current as { stop: () => void })?.stop();
      return;
    }

    const rec = new SpeechRecognition() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onstart: () => void;
      onresult: (event: unknown) => void;
      onerror: (event: unknown) => void;
      onend: () => void;
      start: () => void;
    };
    
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "id-ID"; // Set default to Indonesian speech input

    rec.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    rec.onresult = (event: unknown) => {
      const speechEvent = event as {
        results: Array<Array<{ transcript: string }>>;
      };
      const transcript = speechEvent.results[0][0].transcript;
      setQuery(transcript);
    };

    rec.onerror = (event: unknown) => {
      const errorEvent = event as { error: string };
      console.error("Speech recognition error", errorEvent.error);
      setError(`Kesalahan Input Suara: ${errorEvent.error}`);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setAssistantMessage(null);
    try {
      const assistant = await callAssistant(query);

      if (assistant.intent === "create") {
        const result = await parseEventNL(query);
        onParsed(
          {
            title: result.title,
            date: result.date,
            start_time: result.start_time.length === 5 ? `${result.start_time}:00` : result.start_time,
            duration_minutes: result.duration_minutes,
            participants: result.participants || "",
            recurrence_rule: result.recurrence || null,
          },
          { source: result.source, warnings: result.warnings }
        );
        setOpen(false);
        return;
      }

      setAssistantMessage(assistant.message);
      onAssistant?.(assistant);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to process command";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm"
            onClick={() => !isLoading && setOpen(false)}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, type: "spring", bounce: 0.3 }}
            className="relative z-50 w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 glass bg-white/70 dark:bg-zinc-900/80 shadow-2xl backdrop-blur-2xl"
          >
            {isLoading && (
              <motion.div
                className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              />
            )}

            <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-4 border-b border-zinc-200/50 dark:border-white/5">
              {isLoading ? (
                <Loader2 className="mr-1 h-6 w-6 animate-spin text-primary shrink-0" />
              ) : (
                <Sparkles className="mr-1 h-6 w-6 text-primary shrink-0" />
              )}
              <input
                autoFocus
                className="flex h-12 w-full bg-transparent text-lg outline-none placeholder:text-zinc-500 dark:placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 text-zinc-900 dark:text-zinc-100 font-medium"
                placeholder="Jadwalkan, tanya jadwal, atau cari waktu kosong..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={startListening}
                disabled={isLoading}
                className={`p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                  isListening
                    ? "bg-red-500 text-white animate-pulse shadow-md shadow-red-500/30"
                    : "text-slate-400 dark:text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
                title={isListening ? "Hentikan perekaman suara" : "Gunakan input suara"}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <div className="ml-2 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-200/50 dark:bg-zinc-800/50 px-2 py-1 rounded-md border border-zinc-300/50 dark:border-white/10 shrink-0">
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

            {assistantMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="px-4 py-3 text-sm text-violet-700 dark:text-violet-300 bg-violet-50/80 dark:bg-violet-950/40 border-b border-violet-200/60 dark:border-violet-900/40"
              >
                {assistantMessage}
              </motion.div>
            )}

            <div className="px-4 py-3 text-[12px] text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-x-4 gap-y-1 bg-zinc-50/50 dark:bg-black/20">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary/70" />
                Natural language commands
              </span>
              <span>⌘K open • Esc close • Enter submit</span>
              <span>Examples: &ldquo;jadwalkan meeting besok&rdquo;, &ldquo;pindahkan standup&rdquo;, &ldquo;cari slot kosong&rdquo;</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

