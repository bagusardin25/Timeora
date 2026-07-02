"use client";

import { useState, useEffect } from "react";
import { format, parse } from "date-fns";
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
import { AlertTriangle } from "lucide-react";

export type ConflictData = {
  message: string;
  conflicting_event: string;
  alternatives: Array<{ start_time: string; duration_minutes: number }>;
};

export type EventData = {
  id?: string;
  title: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  duration_minutes: number;
  participants: string;
};

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: Partial<EventData> | null;
  onSave: (data: EventData) => void;
  onDelete?: (id: string) => void;
  isSaving?: boolean;
  conflictData?: ConflictData | null;
  onClearConflict?: () => void;
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
  const [formData, setFormData] = useState<Partial<EventData>>({});
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    if (open) {
      setFormData(
        initialData || {
          title: "",
          date: format(new Date(), "yyyy-MM-dd"),
          start_time: "09:00:00",
          duration_minutes: 60,
          participants: "",
        }
      );
      if (initialData?.start_time && initialData?.duration_minutes) {
         try {
           const [hours, minutes] = initialData.start_time.split(":");
           const d = new Date();
           d.setHours(parseInt(hours, 10));
           d.setMinutes(parseInt(minutes, 10));
           d.setSeconds(0);
           d.setMinutes(d.getMinutes() + initialData.duration_minutes);
           setEndTime(format(d, "HH:mm"));
         } catch(e) {}
      } else {
         setEndTime("10:00");
      }
      if (onClearConflict) onClearConflict();
    }
  }, [open, initialData]);

  const calculateDuration = (start: string, end: string) => {
     try {
       const [h1, m1] = start.split(":");
       const [h2, m2] = end.split(":");
       const d1 = new Date(); d1.setHours(parseInt(h1, 10), parseInt(m1, 10), 0);
       const d2 = new Date(); d2.setHours(parseInt(h2, 10), parseInt(m2, 10), 0);
       const diff = (d2.getTime() - d1.getTime()) / 60000;
       return diff > 0 ? diff : 60;
     } catch(e) {
       return 60;
     }
  };

  const handleSave = () => {
    if (!formData.title || !formData.date || !formData.start_time) return;
    
    // Convert HH:MM to HH:MM:SS for start_time if needed
    let finalStart = formData.start_time;
    if (finalStart.split(":").length === 2) {
       finalStart += ":00";
    }

    onSave({
      id: formData.id as any,
      title: formData.title,
      date: formData.date,
      start_time: finalStart,
      duration_minutes: formData.duration_minutes || 60,
      participants: formData.participants || "",
    });
  };

  const applyAlternative = (alt: { start_time: string; duration_minutes: number }) => {
    const newStart = alt.start_time;
    setFormData({
      ...formData,
      start_time: newStart,
      duration_minutes: alt.duration_minutes,
    });
    
    try {
      const [hours, minutes] = newStart.split(":");
      const d = new Date();
      d.setHours(parseInt(hours, 10));
      d.setMinutes(parseInt(minutes, 10));
      d.setSeconds(0);
      d.setMinutes(d.getMinutes() + alt.duration_minutes);
      setEndTime(format(d, "HH:mm"));
    } catch(e) {}
    
    if (onClearConflict) onClearConflict();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{formData.id ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>
        
        {conflictData && (
          <div className="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-md text-sm space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Jadwal Bentrok!</strong>
                <p>Waktu ini bertabrakan dengan event: "{conflictData.conflicting_event}"</p>
              </div>
            </div>
            
            {conflictData.alternatives && conflictData.alternatives.length > 0 && (
              <div className="pt-2 border-t border-orange-200">
                <p className="font-medium mb-2">Saran AI (Slot Kosong):</p>
                <div className="flex flex-wrap gap-2">
                  {conflictData.alternatives.map((alt, idx) => (
                    <Button
                      key={idx}
                      size="sm"
                      variant="outline"
                      className="bg-white border-orange-300 hover:bg-orange-100 text-orange-700"
                      onClick={() => applyAlternative(alt)}
                    >
                      {alt.start_time.substring(0, 5)} ({alt.duration_minutes}m)
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={formData.title || ""}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Meeting with team"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date || ""}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="startTime">Start Time</Label>
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
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endTime">End Time</Label>
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
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="participants">Participants (Optional)</Label>
            <Input
              id="participants"
              value={formData.participants || ""}
              onChange={(e) => setFormData({ ...formData, participants: e.target.value })}
              placeholder="Comma separated emails"
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between w-full">
          {formData.id ? (
            <Button 
              type="button" 
              variant="destructive" 
              onClick={() => onDelete?.(formData.id as string)}
              disabled={isSaving}
            >
              Delete
            </Button>
          ) : <div></div>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Event"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
