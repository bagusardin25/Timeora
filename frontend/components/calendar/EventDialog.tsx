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
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Bell, Clock, CalendarIcon, Flag, Link, Users, Sparkles, Bookmark, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CATEGORY_OPTIONS, getCategoryConfig } from "@/lib/categories";
import { getTemplates, saveTemplate, applyTemplate, type EventTemplate } from "@/lib/templates";

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
  category?: string | null;
  description: string;
  location_url?: string | null;
  priority: "low" | "normal" | "important";
  tags: string[];
  reminder_minutes?: number | null;
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
    category: null,
    description: "",
    location_url: null,
    priority: "normal",
    tags: [],
    reminder_minutes: null,
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
      category: formData.category || null,
      description: formData.description || "",
      location_url: formData.location_url || null,
      priority: formData.priority || "normal",
      tags: formData.tags || [],
      reminder_minutes: formData.reminder_minutes ?? null,
    });
  };

  const handleApplyTemplate = (template: EventTemplate) => {
    const applied = applyTemplate(template, formData.date || undefined);
    setFormData({ ...formData, ...applied });
    setEndTime(calculateEndTime(applied));
  };

  const handleSaveAsTemplate = () => {
    if (!formData.title) return;
    saveTemplate({
      name: formData.title,
      title: formData.title,
      duration_minutes: formData.duration_minutes || 60,
      start_time: formData.start_time || "09:00:00",
      category: formData.category || null,
      participants: formData.participants || "",
    });
    setSavedTemplate(true);
    setTimeout(() => setSavedTemplate(false), 2000);
  };

  const [savedTemplate, setSavedTemplate] = useState(false);
  const templates = getTemplates();

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
      <DialogContent className="glass fixed top-auto bottom-0 left-0 right-0 z-50 w-full translate-x-0 translate-y-0 border border-zinc-200/50 bg-white/90 p-0 gap-0 shadow-2xl backdrop-blur-2xl rounded-t-3xl overflow-hidden max-h-[calc(100dvh-1rem)] dark:border-white/10 dark:bg-zinc-950/90 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:right-auto sm:w-full sm:max-w-[560px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:max-h-[90dvh] data-[state=closed]:slide-out-to-bottom sm:data-[state=closed]:slide-out-to-bottom-0 data-[state=open]:slide-in-from-bottom sm:data-[state=open]:slide-in-from-bottom-0">
        <DialogHeader className="px-6 py-5 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-black/20">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <CalendarIcon className="w-4 h-4 text-primary" />
            </div>
            {formData.id ? "Edit Event" : "New Event"}
          </DialogTitle>
        </DialogHeader>
        
        {/* Mobile bottom sheet drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
        </div>

        <div className="px-6 py-5 overflow-y-auto max-h-[70dvh] overscroll-contain">
          {/* Template Selector */}
          {!formData.id && (
            <div className="mb-4">
              <Label className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5 mb-2">
                <Bookmark className="w-3.5 h-3.5" /> Quick Template
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((tpl) => {
                  const cat = getCategoryConfig(tpl.category);
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleApplyTemplate(tpl)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:scale-105 hover:shadow-sm ${cat.bg} ${cat.text} ${cat.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                      {tpl.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
              <Label htmlFor="description">Deskripsi</Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Agenda, context, or preparation notes"
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="locationUrl" className="flex items-center gap-1.5">
                <Link className="size-4" /> Meeting link
              </Label>
              <Input
                id="locationUrl"
                type="url"
                value={formData.location_url || ""}
                onChange={(e) => setFormData({ ...formData, location_url: e.target.value || null })}
                placeholder="https://zoom.us/j/..."
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
              <Label htmlFor="category" className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Kategori
              </Label>
              <select
                id="category"
                value={formData.category || ""}
                onChange={(e) => setFormData({ ...formData, category: e.target.value || null })}
                  className="min-h-11 w-full rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/20 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-10"
              >
                <option value="">— No category —</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.emoji} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="priority" className="flex items-center gap-1.5">
                  <Flag className="size-4" /> Priority
                </Label>
                <select
                  id="priority"
                  value={formData.priority || "normal"}
                  onChange={(e) => setFormData({
                    ...formData,
                    priority: e.target.value as EventData["priority"],
                  })}
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm sm:min-h-10"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reminder" className="flex items-center gap-1.5">
                  <Bell className="size-4" /> Reminder
                </Label>
                <select
                  id="reminder"
                  value={formData.reminder_minutes ?? ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    reminder_minutes: e.target.value ? Number(e.target.value) : null,
                  })}
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm sm:min-h-10"
                >
                  <option value="">None</option>
                  <option value="0">At start time</option>
                  <option value="5">5 minutes before</option>
                  <option value="15">15 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="1440">1 day before</option>
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tags" className="flex items-center gap-1.5">
                <Tag className="size-4" /> Tags
              </Label>
              <Input
                id="tags"
                value={(formData.tags || []).join(", ")}
                onChange={(e) => setFormData({
                  ...formData,
                  tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean),
                })}
                placeholder="planning, client, deep-work"
              />
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
        
        <DialogFooter className="sticky bottom-0 m-0 w-full items-center rounded-b-2xl border-t border-border bg-background/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            {formData.id && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={() => onDelete?.(formData.id as string, formData.title)}
                disabled={isSaving}
                className="min-h-11 bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:text-red-700 border-none shadow-none"
              >
                Hapus
              </Button>
            )}
            {!formData.id && formData.title && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSaveAsTemplate}
                disabled={savedTemplate}
                className="text-xs text-slate-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30"
              >
                <Bookmark className="w-3.5 h-3.5 mr-1" />
                {savedTemplate ? "Saved!" : "Save as Template"}
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              disabled={isSaving} 
              className="min-h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 shadow-sm transition-all font-medium rounded-xl px-5"
            >
              Batal
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="min-h-11 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all font-semibold rounded-xl px-6"
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
