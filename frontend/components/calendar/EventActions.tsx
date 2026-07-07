"use client";

import type { ReactNode, SyntheticEvent } from "react";
import { MoreVertical, Pencil, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EventData } from "./EventDialog";

type EventActionsProps = {
  event: EventData;
  children: ReactNode;
  onEdit: (event: EventData) => void;
  onAskAI: (event: EventData) => void;
  onDelete: (event: EventData) => void;
};

function stopCalendarClick(event: SyntheticEvent) {
  event.stopPropagation();
}

export function EventActions({ event, children, onEdit, onAskAI, onDelete }: EventActionsProps) {
  return (
    <div className="group/event relative h-full">
      <ContextMenu>
        <ContextMenuTrigger className="block h-full" onContextMenu={stopCalendarClick}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent onClick={stopCalendarClick} onPointerDown={stopCalendarClick}>
          <ContextMenuGroup>
            <ContextMenuItem onClick={(clickEvent) => {
              stopCalendarClick(clickEvent);
              onEdit(event);
            }}>
              <Pencil /> Edit
            </ContextMenuItem>
            <ContextMenuItem onClick={(clickEvent) => {
              stopCalendarClick(clickEvent);
              onAskAI(event);
            }}>
              <Sparkles /> Ask AI
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={(clickEvent) => {
              stopCalendarClick(clickEvent);
              onDelete(event);
            }}>
              <Trash2 /> Delete
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Event actions"
              onClick={stopCalendarClick}
              onMouseDown={stopCalendarClick}
              onPointerDown={stopCalendarClick}
              className="absolute right-1 top-1 size-11 bg-background/80 opacity-100 shadow-sm md:size-8 md:opacity-0 md:group-hover/event:opacity-100 md:group-focus-within/event:opacity-100"
            />
          }
        >
          <MoreVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={stopCalendarClick} onPointerDown={stopCalendarClick}>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={(clickEvent) => {
              stopCalendarClick(clickEvent);
              onEdit(event);
            }}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(clickEvent) => {
              stopCalendarClick(clickEvent);
              onAskAI(event);
            }}>
              <Sparkles /> Ask AI
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={(clickEvent) => {
              stopCalendarClick(clickEvent);
              onDelete(event);
            }}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
