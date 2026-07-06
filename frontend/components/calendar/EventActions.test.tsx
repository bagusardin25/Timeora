import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventActions } from "./EventActions";
import { safeMeetingUrl } from "./EventPreview";
import type { EventData } from "./EventDialog";

const EVENT: EventData = {
  id: "event-1",
  title: "Product Sync",
  date: "2026-07-06",
  start_time: "14:00:00",
  duration_minutes: 60,
  participants: "team@example.com",
  recurrence_rule: null,
  category: "meeting",
  description: "Roadmap review",
  location_url: "https://zoom.us/j/123",
  priority: "important",
  tags: ["planning"],
  reminder_minutes: 15,
};

describe("EventActions", () => {
  it("provides the touch overflow actions", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onAskAI = vi.fn();
    const onDelete = vi.fn();
    render(
      <EventActions
        event={EVENT}
        onEdit={onEdit}
        onAskAI={onAskAI}
        onDelete={onDelete}
      >
        <div>Event block</div>
      </EventActions>,
    );

    await user.click(screen.getByRole("button", { name: "Event actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Ask AI" }));

    expect(onAskAI).toHaveBeenCalledWith(EVENT);
  });

  it("rejects executable and malformed meeting links", () => {
    expect(safeMeetingUrl("javascript:alert(1)")).toBeNull();
    expect(safeMeetingUrl("not a link")).toBeNull();
    expect(safeMeetingUrl("https://zoom.us/j/123")).toBe("https://zoom.us/j/123");
  });

  it("normalizes common meeting links that omit https", () => {
    expect(safeMeetingUrl("zoom.us/j/123")).toBe("https://zoom.us/j/123");
    expect(safeMeetingUrl(" meet.google.com/abc-defg-hij ")).toBe("https://meet.google.com/abc-defg-hij");
  });
});
