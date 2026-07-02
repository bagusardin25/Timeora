"use client";

import React, { useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

interface WeeklyCalendarProps {
  events: any[]; // FullCalendar Event Source format
  onDateClick: (arg: any) => void;
  onEventClick: (arg: any) => void;
  onEventDrop: (arg: any) => void;
  onEventResize: (arg: any) => void;
}

export function WeeklyCalendar({
  events,
  onDateClick,
  onEventClick,
  onEventDrop,
  onEventResize,
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
