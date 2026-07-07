import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  readStoredPreferences,
  savePreferences,
} from "@/lib/preferences";

describe("preferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("falls back when stored preference fields have invalid types", () => {
    const preferences = normalizePreferences(
      {
        timezone: 123,
        defaultDuration: "abc",
        workingHoursStart: "25:99",
        workingHoursEnd: null,
      },
      "Asia/Jakarta",
    );

    expect(preferences).toEqual({
      timezone: "Asia/Jakarta",
      defaultDuration: DEFAULT_PREFERENCES.defaultDuration,
      workingHoursStart: DEFAULT_PREFERENCES.workingHoursStart,
      workingHoursEnd: DEFAULT_PREFERENCES.workingHoursEnd,
    });
  });

  it("clamps default event duration to the supported input range", () => {
    expect(normalizePreferences({ defaultDuration: 1 }).defaultDuration).toBe(5);
    expect(normalizePreferences({ defaultDuration: 999 }).defaultDuration).toBe(480);
  });

  it("recovers from malformed stored preference JSON", () => {
    localStorage.setItem("timeora_preferences", "{bad-json");

    expect(readStoredPreferences("Asia/Jakarta")).toEqual({
      ...DEFAULT_PREFERENCES,
      timezone: "Asia/Jakarta",
    });
  });

  it("saves normalized preferences back to localStorage", () => {
    const saved = savePreferences({
      ...DEFAULT_PREFERENCES,
      timezone: "Asia/Jakarta",
      defaultDuration: 999,
      workingHoursStart: "7am",
    });

    expect(saved.defaultDuration).toBe(480);
    expect(saved.workingHoursStart).toBe(DEFAULT_PREFERENCES.workingHoursStart);
    expect(JSON.parse(localStorage.getItem("timeora_preferences") ?? "{}")).toEqual(saved);
  });
});
