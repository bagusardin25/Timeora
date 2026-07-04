"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Clock, CalendarIcon, Users, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type ConflictData = {
  message: string;
  conflicting_event: string;
  alternatives: Array<{ start_time: string; duration_minutes: number; reason?: string }>;
};

export type EventData = {
  id?: string;
  title: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  duration_minutes: number;
  participants: string;
  recurrence_rule?: string | null;
};

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: Partial<EventData> | null;
  onSave: (data: EventData) => void;
  onDelete?: (id: string, title?: string) => void;
  isSaving?: boolean;
  conflictData?: ConflictData | null;
  onClearConflict?: () => void;
}

function defaultEventData(initialData: Partial<EventData> | null): Partial<EventData> {
  return initialData || {
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start_time: "09:00:00",
    duration_minutes: 60,
    participants: "",
  };
}

function calculateEndTime(data: Partial<EventData>): string {
  if (!data.start_time || !data.duration_minutes) return "10:00";

  const [hours, minutes] = data.start_time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "10:00";

  const end = new Date();
  end.setHours(hours, minutes, 0, 0);
  end.setMinutes(end.getMinutes() + data.duration_minutes);
  return format(end, "HH:mm");
}

export function EventDialog({
  open,
  onOpenChange,
  initialData,
  onSave,
  onDelete,
  isSaving,
  conflictData,
  onClearConflict,
}: EventDialogProps) {
  const initialFormData = defaultEventData(initialData);
  const [formData, setFormData] =
    useState<Partial<EventData>>(initialFormData);
  const [endTime, setEndTime] = useState(() => calculateEndTime(initialFormData));

  const calculateDuration = (start: string, end: string) => {
    const [h1, m1] = start.split(":").map(Number);
    const [h2, m2] = end.split(":").map(Number);
    if (![h1, m1, h2, m2].every(Number.isFinite)) return 60;

    const startMinutes = h1 * 60 + m1;
    const endMinutes = h2 * 60 + m2;
    const difference = endMinutes - startMinutes;
    return difference > 0 ? difference : 60;
  };

  const handleSave = () => {
    if (!formData.title || !formData.date || !formData.start_time) return;
    
    // Convert HH:MM to HH:MM:SS for start_time if needed
    let finalStart = formData.start_time;
    if (finalStart.split(":").length === 2) {
       finalStart += ":00";
    }

    onSave({
      id: formData.id,
      title: formData.title,
      date: formData.date,
      start_time: finalStart,
      duration_minutes: formData.duration_minutes || 60,
      participants: formData.participants || "",
      recurrence_rule: formData.recurrence_rule || null,
    });
  };

  const applyAlternative = (alt: { start_time: string; duration_minutes: number }) => {
    const newStart = alt.start_time;
    setFormData({
      ...formData,
      start_time: newStart,
      duration_minutes: alt.duration_minutes,
    });
    
    setEndTime(calculateEndTime({
      start_time: newStart,
      duration_minutes: alt.duration_minutes,
    }));
    
    if (onClearConflict) onClearConflict();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] glass border border-zinc-200/50 dark:border-white/10 bg-white/90 dark:bg-zinc-950/90 shadow-2xl backdrop-blur-2xl rounded-2xl overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 py-5 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-black/20">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <CalendarIcon className="w-4 h-4 text-primary" />
            </div>
            {formData.id ? "Edit Event" : "New Event"}
          </DialogTitle>
        </DialogHeader>
        
        <div className="px-6 py-5 overflow-y-auto max-h-[70vh]">
          <AnimatePresence>
            {conflictData && (
              <motion.div 
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: "auto", scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                transition={{ duration: 0.3, type: "spring", bounce: 0.2 }}
                className="overflow-hidden mb-5"
              >
                <div className="bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-400 p-4 rounded-xl text-sm space-y-3 relative overflow-hidden shadow-inner">
                  <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-orange-500/20 rounded-full flex-shrink-0">
                      <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <strong className="block font-semibold text-orange-800 dark:text-orange-300 mb-1">Jadwal Bentrok!</strong>
                      <p className="opacity-90">Waktu ini bertabrakan dengan: <span className="font-medium bg-orange-500/10 px-1 py-0.5 rounded">&ldquo;{conflictData.conflicting_event}&rdquo;</span></p>
                    </div>
                  </div>
                  
                  {conflictData.alternatives && conflictData.alternatives.length > 0 && (
                    <div className="pt-3 mt-1 border-t border-orange-500/20">
                      <p className="font-medium mb-2 flex items-center gap-1.5 opacity-90">
                        <Sparkles className="w-3.5 h-3.5" /> Saran AI (Slot Kosong):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {conflictData.alternatives.map((alt, idx) => (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            key={idx}
                            onClick={() => applyAlternative(alt)}
                            title={alt.reason || undefined}
                            className="flex flex-col items-start gap-0.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 transition-colors text-left"
                          >
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3" />
                              {alt.start_time.substring(0, 5)} ({alt.duration_minutes}m)
                            </span>
                            {alt.reason && (
                              <span className="text-[10px] opacity-80 font-normal pl-4">{alt.reason}</span>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="title" className="text-zinc-600 dark:text-zinc-400">Judul Event</Label>
              <Input
                id="title"
                value={formData.title || ""}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Meeting with team"
                className="bg-zinc-50 dark:bg-black/20 border-zinc-200 dark:border-white/10 focus-visible:ring-primary shadow-sm"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="date" className="text-zinc-600 dark:text-zinc-400">Tanggal</Label>
              <Input
                id="date"
                type="date"
                value={formData.date || ""}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="bg-zinc-50 dark:bg-black/20 border-zinc-200 dark:border-white/10 focus-visible:ring-primary shadow-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startTime" className="text-zinc-600 dark:text-zinc-400">Mulai</Label>
                <div className="relative">
                  <Input
                    id="startTime"
                    type="time"
                    value={(formData.start_time || "").substring(0, 5)}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setFormData({ 
                        ...formData, 
                        start_time: newStart,
                        duration_minutes: calculateDuration(newStart, endTime)
                      });
                    }}
                    className="bg-zinc-50 dark:bg-black/20 border-zinc-200 dark:border-white/10 focus-visible:ring-primary shadow-sm"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endTime" className="text-zinc-600 dark:text-zinc-400">Selesai</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    if (formData.start_time) {
                      setFormData({
                        ...formData,
                        duration_minutes: calculateDuration(formData.start_time, e.target.value)
                      });
                    }
                  }}
                  className="bg-zinc-50 dark:bg-black/20 border-zinc-200 dark:border-white/10 focus-visible:ring-primary shadow-sm"
                />
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="participants" className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Partisipan (Opsional)
              </Label>
              <Input
                id="participants"
                value={formData.participants || ""}
                onChange={(e) => setFormData({ ...formData, participants: e.target.value })}
                placeholder="Comma separated emails"
                className="bg-zinc-50 dark:bg-black/20 border-zinc-200 dark:border-white/10 focus-visible:ring-primary shadow-sm"
              />
            </div>
          </div>
        </div>
        
        <DialogFooter className="m-0 rounded-b-2xl px-6 py-4 border-t border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-black/20 flex sm:justify-between w-full items-center">
          <div>
            {formData.id && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={() => onDelete?.(formData.id as string, formData.title)}
                disabled={isSaving}
                className="bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:text-red-700 border-none shadow-none"
              >
                Hapus
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              disabled={isSaving} 
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 shadow-sm transition-all font-medium rounded-xl px-5"
            >
              Batal
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all font-semibold rounded-xl px-6"
            >
              {isSaving ? (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                  <Clock className="w-4 h-4 mr-2" />
                </motion.div>
              ) : null}
              {isSaving ? "Menyimpan..." : "Simpan Event"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
