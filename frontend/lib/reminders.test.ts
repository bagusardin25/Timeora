import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createReminderScheduler,
  getReminderDelayMs,
  getReminderFireTime,
  gmailSearchUrl,
  requestReminderPermission,
  type ReminderEvent,
} from "./reminders";

const EVENT: ReminderEvent = {
  id: "event-1",
  title: "Product Sync",
  date: "2026-07-06",
  start_time: "14:00:00",
  participants: "team@example.com",
  reminder_minutes: 15,
};

describe("reminders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calculates the notification fire time and delay", () => {
    const fireTime = getReminderFireTime(EVENT);

    expect(fireTime?.getHours()).toBe(13);
    expect(fireTime?.getMinutes()).toBe(45);
    expect(getReminderDelayMs(EVENT, new Date(fireTime!.getTime() - 15 * 60_000))).toBe(15 * 60_000);
  });

  it("falls back in-app when browser notification permission is denied", () => {
    const notify = vi.fn();
    const fallback = vi.fn();
    const afterFireTime = new Date(getReminderFireTime(EVENT)!.getTime() + 60_000);
    const scheduler = createReminderScheduler({
      now: () => afterFireTime,
      permission: () => "denied",
      notify,
      fallback,
    });

    scheduler.schedule([EVENT]);

    expect(notify).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith(expect.objectContaining({ title: "Product Sync" }));
  });

  it("suppresses duplicate reminders for the same event occurrence", () => {
    const fallback = vi.fn();
    const afterFireTime = new Date(getReminderFireTime(EVENT)!.getTime() + 60_000);
    const scheduler = createReminderScheduler({
      now: () => afterFireTime,
      permission: () => "unsupported",
      fallback,
    });

    scheduler.schedule([EVENT]);
    scheduler.schedule([EVENT]);

    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("ignores non-finite reminder values instead of scheduling invalid timers", () => {
    const setTimer = vi.fn();
    const fallback = vi.fn();
    const invalidEvent: ReminderEvent = {
      ...EVENT,
      reminder_minutes: Number.NaN,
    };
    const scheduler = createReminderScheduler({
      setTimer,
      fallback,
    });

    scheduler.schedule([invalidEvent]);

    expect(getReminderFireTime(invalidEvent)).toBeNull();
    expect(setTimer).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("creates a safe encoded Gmail search URL", () => {
    expect(gmailSearchUrl({
      title: "Product Sync / Q3",
      participants: "team@example.com boss@example.com",
    })).toBe(
      "https://mail.google.com/mail/u/0/#search/Product%20Sync%20%2F%20Q3%20team%40example.com%20boss%40example.com",
    );
  });

  it("falls back when browser notification permission requests fail", async () => {
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: vi.fn().mockRejectedValue(new Error("blocked")),
    });

    await expect(requestReminderPermission()).resolves.toBe("unsupported");
  });
});
