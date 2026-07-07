import { render, screen } from "@testing-library/react";
import type { EventInput } from "@fullcalendar/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TodayAgenda } from "./TodayAgenda";

describe("TodayAgenda", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an overnight event that started yesterday but is still happening now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T00:30:00"));
    const overnightEvent: EventInput = {
      id: "event-1",
      title: "Late deployment",
      start: "2026-07-06T23:30:00",
      end: "2026-07-07T01:00:00",
      extendedProps: {
        duration_minutes: 90,
        category: "meeting",
      },
    };

    render(<TodayAgenda events={[overnightEvent]} />);

    expect(screen.getAllByText("Late deployment").length).toBeGreaterThan(0);
    expect(screen.getByText("Happening now")).toBeInTheDocument();
  });
});
