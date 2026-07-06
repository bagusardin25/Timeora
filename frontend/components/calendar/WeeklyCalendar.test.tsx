import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@fullcalendar/react", async () => {
  const React = await import("react");

  type MockFullCalendarProps = {
    initialView?: string;
    events?: unknown[];
    datesSet?: (arg: { start: Date; end: Date; view: { title: string; type: string } }) => void;
  };

  const MockFullCalendar = React.forwardRef(
    function MockFullCalendar(props: MockFullCalendarProps, ref) {
      const { datesSet, events, initialView } = props;
      React.useImperativeHandle(ref, () => ({
        getApi: () => ({
          view: { type: initialView ?? "timeGridWeek" },
          changeView: () => undefined,
          prev: () => undefined,
          next: () => undefined,
          today: () => undefined,
        }),
      }));

      React.useEffect(() => {
        datesSet?.({
          start: new Date(2026, 6, 6),
          end: new Date(2026, 6, 13),
          view: { title: "July 2026", type: initialView ?? "timeGridWeek" },
        });
      }, [datesSet, initialView]);

      return <div data-testid="calendar">{events?.length ?? 0}</div>;
    },
  );

  return { default: MockFullCalendar };
});

import { WeeklyCalendar } from "./WeeklyCalendar";

const noop = vi.fn();

describe("WeeklyCalendar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to default presets when stored presets are corrupted", () => {
    localStorage.setItem("timeora_category_presets", "{not valid json");

    expect(() => {
      render(
        <WeeklyCalendar
          events={[]}
          onDateClick={noop}
          onEventClick={noop}
          onEventDrop={noop}
          onEventResize={noop}
        />,
      );
    }).not.toThrow();

    expect(screen.getByRole("button", { name: "All" })).toBeVisible();
  });

  it("does not crash when saved view storage fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue("Focus View");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    render(
      <WeeklyCalendar
        events={[]}
        onDateClick={noop}
        onEventClick={noop}
        onEventDrop={noop}
        onEventResize={noop}
      />,
    );

    await expect(user.click(screen.getByRole("button", { name: "+ Save" }))).resolves.toBeUndefined();
    expect(screen.getByRole("button", { name: "Focus View" })).toBeVisible();
  });

  it("reports visible range using local calendar dates", async () => {
    const onDatesChange = vi.fn();

    render(
      <WeeklyCalendar
        events={[]}
        onDateClick={noop}
        onEventClick={noop}
        onEventDrop={noop}
        onEventResize={noop}
        onDatesChange={onDatesChange}
      />,
    );

    await waitFor(() => {
      expect(onDatesChange).toHaveBeenCalledWith("2026-07-06", "2026-07-13");
    });
  });
});
