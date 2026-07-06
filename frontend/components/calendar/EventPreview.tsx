"use client";

import { Bell, ExternalLink, Mail, MapPin, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { gmailSearchUrl } from "@/lib/reminders";
import type { EventData } from "./EventDialog";

export function safeMeetingUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function EventPreview({ event }: { event: EventData }) {
  const meetingUrl = safeMeetingUrl(event.location_url);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{event.title}</p>
          <p className="text-xs text-muted-foreground">
            {event.date} · {event.start_time.slice(0, 5)} · {event.duration_minutes} min
          </p>
        </div>
        {event.priority === "important" ? <Badge variant="destructive">Important</Badge> : null}
      </div>

      {event.description ? <p className="text-sm leading-6 text-muted-foreground">{event.description}</p> : null}

      {event.tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          <Tag aria-hidden="true" className="size-4 text-muted-foreground" />
          {event.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {meetingUrl ? (
          <Button variant="outline" size="sm" render={<a href={meetingUrl} target="_blank" rel="noreferrer" />}>
            <MapPin data-icon="inline-start" /> Join meeting <ExternalLink data-icon="inline-end" />
          </Button>
        ) : null}
        <Button variant="outline" size="sm" render={<a href={gmailSearchUrl(event)} target="_blank" rel="noreferrer" />}>
          <Mail data-icon="inline-start" /> Find in Gmail
        </Button>
      </div>

      {event.reminder_minutes !== null && event.reminder_minutes !== undefined ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Bell aria-hidden="true" className="size-4" />
          Remind me {event.reminder_minutes} minutes before
        </p>
      ) : null}
    </div>
  );
}
