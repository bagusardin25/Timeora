import { render, screen } from "@testing-library/react";
import type { EventInput } from "@fullcalendar/core";
import { describe, expect, it } from "vitest";

import { NotificationCenter } from "./NotificationCenter";

function dueSoonEvent(): EventInput {
  const start = new Date();
  start.setMinutes(start.getMinutes() + 14);
  return {
    id: "event-1",
    title: "Product Sync",
    start,
    extendedProps: {
      participants: "team@example.com",
      reminder_minutes: 15,
    },
  };
}

describe("NotificationCenter", () => {
  it("shows an in-app reminder fallback when browser notifications are unavailable", async () => {
    render(<NotificationCenter events={[dueSoonEvent()]} />);

    expect(await screen.findByText("Product Sync")).toBeVisible();
    expect(screen.getByText(/Starts at/)).toBeVisible();
  });
});
