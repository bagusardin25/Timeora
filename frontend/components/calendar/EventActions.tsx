"use client";

import type { ReactNode } from "react";
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

export function EventActions({ event, children, onEdit, onAskAI, onDelete }: EventActionsProps) {
  return (
    <div className="group/event relative h-full">
      <ContextMenu>
        <ContextMenuTrigger className="block h-full">{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => onEdit(event)}>
              <Pencil /> Edit
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAskAI(event)}>
              <Sparkles /> Ask AI
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={() => onDelete(event)}>
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
              className="absolute right-1 top-1 size-11 bg-background/80 opacity-100 shadow-sm md:size-8 md:opacity-0 md:group-hover/event:opacity-100 md:group-focus-within/event:opacity-100"
            />
          }
        >
          <MoreVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onEdit(event)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAskAI(event)}>
              <Sparkles /> Ask AI
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(event)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
