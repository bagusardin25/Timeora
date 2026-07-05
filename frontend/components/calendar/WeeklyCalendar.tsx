"use client";

import React, { useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, {
  type DateClickArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import type {
  EventClickArg,
  EventDropArg,
  EventInput,
  EventContentArg,
} from "@fullcalendar/core";
import { CATEGORY_OPTIONS, getCategoryConfig } from "@/lib/categories";
import { Plus, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

interface WeeklyCalendarProps {
  events: EventInput[];
  onDateClick: (arg: DateClickArg) => void;
  onEventClick: (arg: EventClickArg) => void;
  onEventDrop: (arg: EventDropArg) => void;
  onEventResize: (arg: EventResizeDoneArg) => void;
  onDatesChange?: (from: string, to: string) => void;
  onAddEventClick?: () => void;
  onEventCategoryChange?: (eventId: string, category: string) => void;
}



export function WeeklyCalendar({
  events,
  onDateClick,
  onEventClick,
  onEventDrop,
  onEventResize,
  onDatesChange,
  onAddEventClick,
  onEventCategoryChange,
}: WeeklyCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const categoryDragEventIdRef = useRef<string | null>(null);

  // Render custom event content — defined inside the component so it can
  // access `categoryDragEventIdRef` as a fallback when FullCalendar's
  // interactionPlugin swallows the native HTML5 dataTransfer.
  const renderEventContent = React.useCallback((arg: EventContentArg) => {
    const ext = arg.event.extendedProps as Record<string, unknown>;
    const cat = getCategoryConfig(ext.category as string | null | undefined);
    const isDayGrid = arg.view.type === "dayGridMonth";
    const eventId = arg.event.id as string;
    const categoryKey = (ext.category as string) || "uncategorized";

    const handleDragStart = (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", eventId);
      e.dataTransfer.effectAllowed = "move";
      // Fallback: FullCalendar may consume dataTransfer, so persist in ref
      categoryDragEventIdRef.current = eventId;
    };

    if (isDayGrid) {
      return (
        <div
          draggable
          onDragStart={handleDragStart}
          data-timeora-event-id={eventId}
          data-timeora-category={categoryKey}
          className="flex items-center gap-1.5 px-1.5 py-0.5 overflow-hidden w-full cursor-grab active:cursor-grabbing"
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: cat.calendarBg }}
          />
          <span className="text-xs font-medium truncate">
            {arg.timeText && (
              <span className="font-semibold mr-1">{arg.timeText}</span>
            )}
            {arg.event.title}
          </span>
        </div>
      );
    }

    return (
      <div
        draggable
        onDragStart={handleDragStart}
        data-timeora-event-id={eventId}
        data-timeora-category={categoryKey}
        className="flex items-start gap-1.5 px-1.5 py-1 overflow-hidden h-full cursor-grab active:cursor-grabbing"
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
          style={{ backgroundColor: cat.calendarBg }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate leading-tight">
            {arg.event.title}
          </p>
          {arg.timeText && (
            <p className="text-[10px] opacity-80 truncate">{arg.timeText}</p>
          )}
        </div>
      </div>
    );
  }, []);
  const [isMobile, setIsMobile] = React.useState(false);
  const [currentView, setCurrentView] = React.useState("timeGridWeek");
  const [calendarTitle, setCalendarTitle] = React.useState("");
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>(() => [
    "meeting", "personal", "focus", "health", "social", "other", "uncategorized"
  ]);

  // Saved views / filter presets (localStorage)
  const [presets, setPresets] = React.useState<Record<string, string[]>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('timeora_category_presets');
      if (saved) return JSON.parse(saved);
    }
    return {
      "All": ["meeting", "personal", "focus", "health", "social", "other", "uncategorized"],
      "Work": ["meeting", "focus"],
      "Focus": ["focus"],
      "Life": ["personal", "health", "social"],
    };
  });

  const saveCurrentAsPreset = (name: string) => {
    const newPresets = { ...presets, [name]: [...selectedCategories] };
    setPresets(newPresets);
    localStorage.setItem('timeora_category_presets', JSON.stringify(newPresets));
  };

  const applyPreset = (cats: string[]) => {
    setSelectedCategories(cats);
  };

  const handleCategoryDrop = (e: React.DragEvent, newCategory: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Primary: native dataTransfer. Fallback: ref set during onDragStart.
    const eventId =
      e.dataTransfer.getData("text/plain") || categoryDragEventIdRef.current;
    categoryDragEventIdRef.current = null; // clear after use
    if (eventId && onEventCategoryChange) {
      onEventCategoryChange(eventId, newCategory);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (calendarRef.current) {
        const api = calendarRef.current.getApi();
        if (mobile && api.view.type === 'timeGridWeek') {
          api.changeView('timeGridDay');
          setCurrentView('timeGridDay');
        } else if (!mobile && api.view.type === 'timeGridDay') {
          api.changeView('timeGridWeek');
          setCurrentView('timeGridWeek');
        }
      }
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleCategory = (categoryKey: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryKey)) {
        return prev.filter(c => c !== categoryKey);
      } else {
        return [...prev, categoryKey];
      }
    });
  };

  const filteredEvents = React.useMemo(() => {
    return events.filter(event => {
      const ext = (event.extendedProps || {}) as Record<string, unknown>;
      const category = (ext.category as string) || "uncategorized";
      return selectedCategories.includes(category);
    });
  }, [events, selectedCategories]);

  // Compute counts per category from all events
  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(event => {
      const ext = (event.extendedProps || {}) as Record<string, unknown>;
      const category = (ext.category as string) || "uncategorized";
      counts[category] = (counts[category] || 0) + 1;
    });
    return counts;
  }, [events]);

  // Programmatic calendar controls
  const handlePrev = () => calendarRef.current?.getApi().prev();
  const handleNext = () => calendarRef.current?.getApi().next();
  const handleToday = () => calendarRef.current?.getApi().today();
  const handleViewChange = (viewId: string) => {
    calendarRef.current?.getApi().changeView(viewId);
    setCurrentView(viewId);
  };

  const views = [
    { id: "dayGridMonth", label: "Month" },
    { id: "timeGridWeek", label: "Week" },
    { id: "timeGridDay", label: "Day" },
  ];

  return (
    <div className="w-full flex flex-col h-full gap-5">
      {/* Custom Premium Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-white/5">
        {/* Left side: Navigation & Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-slate-200/50 dark:border-white/5 shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg hover:bg-white dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white tracking-tight shrink-0 select-none">
            {calendarTitle}
          </h3>
        </div>

        {/* Right side: View selector */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-slate-200/50 dark:border-white/5 relative">
            {views.map((v) => {
              const isActive = currentView === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleViewChange(v.id)}
                  className="relative px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer select-none"
                  style={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeViewIndicator"
                      className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-lg shadow-sm z-0"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category filter bar & Add button */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-white/5">
        {/* Saved Views / Presets */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-400 dark:text-zinc-500 font-semibold mr-1">Views:</span>
          {Object.keys(presets).map((name) => (
            <button
              key={name}
              onClick={() => applyPreset(presets[name])}
              className="px-2.5 py-1 text-[10px] rounded-lg border bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
            >
              {name}
            </button>
          ))}
          <button
            onClick={() => {
              const name = prompt("Save current filter as:", "My View");
              if (name) saveCurrentAsPreset(name);
            }}
            className="px-2 py-1 text-[10px] text-violet-600 dark:text-violet-400 hover:text-violet-700 border border-dashed border-violet-300 dark:border-violet-800 rounded-lg"
          >
            + Save
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
          <span className="text-slate-400 dark:text-zinc-500 font-semibold mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          
          {CATEGORY_OPTIONS.map(cat => {
            const isActive = selectedCategories.includes(cat.key);
            const count = categoryCounts[cat.key] || 0;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => toggleCategory(cat.key)}
                onDragOver={handleDragOver}
                onDragOverCapture={handleDragOver}
                onDrop={(e) => handleCategoryDrop(e, cat.key)}
                onDropCapture={(e) => handleCategoryDrop(e, cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all cursor-pointer font-medium hover:scale-[1.03] ${
                  isActive
                    ? `${cat.bg} ${cat.text} ${cat.border}`
                    : "bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500 opacity-60 hover:opacity-100"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? cat.dot : "bg-slate-300 dark:bg-zinc-700"}`} />
                <span>{cat.emoji} {cat.label}</span>
                <span className="ml-0.5 px-1.5 py-0.2 bg-black/5 dark:bg-white/10 rounded-full text-[9px] font-bold">
                  {count}
                </span>
              </button>
            );
          })}
          
          <button
            type="button"
            onClick={() => toggleCategory("uncategorized")}
            onDragOver={handleDragOver}
            onDragOverCapture={handleDragOver}
            onDrop={(e) => handleCategoryDrop(e, "uncategorized")}
            onDropCapture={(e) => handleCategoryDrop(e, "uncategorized")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all cursor-pointer font-medium hover:scale-[1.03] ${
              selectedCategories.includes("uncategorized")
                ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                : "bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500 opacity-60 hover:opacity-100"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${selectedCategories.includes("uncategorized") ? "bg-indigo-500" : "bg-slate-300 dark:bg-zinc-700"}`} />
            <span>📅 Uncategorized</span>
            <span className="ml-0.5 px-1.5 py-0.2 bg-black/5 dark:bg-white/10 rounded-full text-[9px] font-bold">
              {categoryCounts["uncategorized"] || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (selectedCategories.length === 7) {
                setSelectedCategories([]);
              } else {
                setSelectedCategories(["meeting", "personal", "focus", "health", "social", "other", "uncategorized"]);
              }
            }}
            className="text-[11px] text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 transition-colors ml-2 font-semibold cursor-pointer"
          >
            {selectedCategories.length === 7 ? "Clear All" : "Select All"}
          </button>
        </div>

        {onAddEventClick && (
          <button
            type="button"
            onClick={onAddEventClick}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer shrink-0 xl:ml-auto"
          >
            <Plus className="w-4 h-4" />
            Tambah Event
          </button>
        )}
      </div>

      {/* Calendar Area - Robust height (no brittle 100vh calc) */}
      <div className="bg-transparent rounded-lg w-full flex flex-col min-h-[520px] h-[620px] lg:h-[min(680px,calc(100vh-240px))]">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={false} // Custom toolbar active instead
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={false}
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          events={filteredEvents}
          dateClick={onDateClick}
          eventClick={onEventClick}
          eventDrop={onEventDrop}
          eventResize={onEventResize}
          eventContent={renderEventContent}
          datesSet={(arg) => {
            setCalendarTitle(arg.view.title);
            if (onDatesChange) {
              const from = arg.start.toISOString().slice(0, 10);
              const to = arg.end.toISOString().slice(0, 10);
              onDatesChange(from, to);
            }
          }}
          height="100%"
          expandRows={true}
          nowIndicator={true}
          eventClassNames={() => {
            return `cursor-pointer transition-transform hover:scale-[1.02] shadow-sm !border-l-[3px]`;
          }}
          eventBackgroundColor="#6366f1"
          eventBorderColor="#4f46e5"
          eventDidMount={(info) => {
            const ext = info.event.extendedProps as Record<string, unknown>;
            const cat = getCategoryConfig(ext.category as string | null | undefined);
            info.el.style.backgroundColor = cat.calendarBg;
            info.el.style.borderColor = cat.calendarBorder;
            info.el.style.borderLeftColor = cat.calendarBorder;
            // Stable selectors for testing and drag fallback
            info.el.setAttribute("data-timeora-event-id", info.event.id);
            info.el.setAttribute(
              "data-timeora-category",
              (ext.category as string) || "uncategorized"
            );
          }}
          titleFormat={
            isMobile 
              ? { month: 'short', day: 'numeric' } 
              : { month: 'long', year: 'numeric', day: 'numeric' }
          }
        />
      </div>
    </div>
  );
}


