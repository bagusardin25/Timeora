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
} from "@fullcalendar/core";

interface WeeklyCalendarProps {
  events: EventInput[];
  onDateClick: (arg: DateClickArg) => void;
  onEventClick: (arg: EventClickArg) => void;
  onEventDrop: (arg: EventDropArg) => void;
  onEventResize: (arg: EventResizeDoneArg) => void;
  onDatesChange?: (from: string, to: string) => void;
}

export function WeeklyCalendar({
  events,
  onDateClick,
  onEventClick,
  onEventDrop,
  onEventResize,
  onDatesChange,
}: WeeklyCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (calendarRef.current) {
        const api = calendarRef.current.getApi();
        if (mobile && api.view.type === 'timeGridWeek') {
          api.changeView('timeGridDay');
        } else if (!mobile && api.view.type === 'timeGridDay') {
          api.changeView('timeGridWeek');
        }
      }
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="bg-transparent rounded-lg w-full flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: "500px" }}>
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
        headerToolbar={{
          left: isMobile ? "prev,next" : "prev,next today",
          center: "title",
          right: isMobile ? "today" : "timeGridWeek,timeGridDay",
        }}
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
        allDaySlot={false}
        editable={true}
        selectable={true}
        selectMirror={true}
        dayMaxEvents={true}
        events={events}
        dateClick={onDateClick}
        eventClick={onEventClick}
        eventDrop={onEventDrop}
        eventResize={onEventResize}
        datesSet={(arg) => {
          if (onDatesChange) {
            const from = arg.start.toISOString().slice(0, 10);
            const to = arg.end.toISOString().slice(0, 10);
            onDatesChange(from, to);
          }
        }}
        height="100%"
        expandRows={true}
        nowIndicator={true}
        eventClassNames={() => "cursor-pointer transition-transform hover:scale-[1.02] shadow-sm"}
        titleFormat={
          isMobile 
            ? { month: 'short', day: 'numeric' } 
            : { month: 'long', year: 'numeric', day: 'numeric' }
        }
      />
    </div>
  );
}
