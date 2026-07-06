import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@fullcalendar/react", async () => {
  const React = await import("react");

  type MockFullCalendarProps = {
    initialView?: string;
    events?: unknown[];
  };

  const MockFullCalendar = React.forwardRef(
    function MockFullCalendar(props: MockFullCalendarProps, ref) {
      React.useImperativeHandle(ref, () => ({
        getApi: () => ({
          view: { type: props.initialView ?? "timeGridWeek" },
          changeView: () => undefined,
          prev: () => undefined,
          next: () => undefined,
          today: () => undefined,
        }),
      }));

      return <div data-testid="calendar">{props.events?.length ?? 0}</div>;
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
});
