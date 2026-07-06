import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callAssistant, executeAssistant } from "@/lib/api";
import { AssistantPanel } from "./AssistantPanel";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    callAssistant: vi.fn(),
    executeAssistant: vi.fn(),
  };
});

const callAssistantMock = vi.mocked(callAssistant);
const executeAssistantMock = vi.mocked(executeAssistant);

describe("AssistantPanel", () => {
  beforeEach(() => {
    callAssistantMock.mockReset();
    executeAssistantMock.mockReset();
  });

  it("submits from a visible Send button and renders feedback", async () => {
    const user = userEvent.setup();
    callAssistantMock.mockResolvedValue({
      intent: "query",
      result: [],
      events: [],
      suggested_actions: [],
      message: "I found 3 events today.",
    });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Apa jadwal saya hari ini?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(callAssistantMock).toHaveBeenCalledWith("Apa jadwal saya hari ini?", undefined);
    expect(await screen.findByText("I found 3 events today.")).toBeVisible();
  });

  it("renders clarification choices and resubmits with the selected event", async () => {
    const user = userEvent.setup();
    callAssistantMock
      .mockResolvedValueOnce({
        intent: "cancel",
        result: { events: [] },
        message: "Which event did you mean?",
        clarification: {
          type: "event_selection",
          prompt: "Which team meeting did you mean?",
          choices: [
            { id: "one", title: "Marketing Sync", start_time: "10:00:00" },
            { id: "two", title: "Product Sync", start_time: "14:00:00" },
          ],
        },
      })
      .mockResolvedValueOnce({
        intent: "cancel",
        result: { primary_event_id: "two", primary_title: "Product Sync" },
        message: "Cancel Product Sync?",
        requires_confirmation: true,
      });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Batalkan team sync");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: /Product Sync/ }));

    expect(callAssistantMock).toHaveBeenLastCalledWith("Batalkan team sync", {
      selected_event_id: "two",
    });
    expect(await screen.findByRole("button", { name: "Confirm action" })).toBeVisible();
  });

  it("confirms native update tool results with event data", async () => {
    const user = userEvent.setup();
    const onEventsChanged = vi.fn();
    callAssistantMock.mockResolvedValueOnce({
      intent: "update",
      result: {
        primary_event_id: "event-1",
        event_data: { description: "Updated prep notes", priority: "important" },
      },
      message: "Update Product Sync?",
      requires_confirmation: true,
    });
    executeAssistantMock.mockResolvedValueOnce({
      intent: "update",
      result: { id: "event-1", title: "Product Sync" },
      message: "Event updated.",
      executed: true,
    });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={onEventsChanged} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Make Product Sync important");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Confirm action" }));

    expect(executeAssistantMock).toHaveBeenCalledWith({
      action: "update",
      event_id: "event-1",
      event_data: { description: "Updated prep notes", priority: "important" },
    });
    expect(onEventsChanged).toHaveBeenCalled();
  });
});
