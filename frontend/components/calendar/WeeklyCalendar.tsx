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

  return (
    <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-4 h-[700px] w-full flex flex-col">
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "timeGridWeek,timeGridDay",
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
        eventClassNames={() => "cursor-pointer"}
      />
    </div>
  );
}
