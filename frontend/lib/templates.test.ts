import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTemplate, getCustomTemplates, saveTemplate } from "./templates";

describe("templates", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("recovers when stored custom templates are not an array", () => {
    localStorage.setItem("timeora_templates", "{}");

    expect(getCustomTemplates()).toEqual([]);
    expect(() => saveTemplate({
      name: "Planning",
      title: "Planning",
      duration_minutes: 30,
      start_time: "10:00:00",
      category: "meeting",
      participants: "",
    })).not.toThrow();
  });

  it("drops stored custom templates with invalid scheduling fields", () => {
    localStorage.setItem("timeora_templates", JSON.stringify([
      {
        id: "custom-valid",
        name: "Planning",
        title: "Planning",
        duration_minutes: 30,
        start_time: "10:00:00",
        category: "meeting",
        participants: "",
      },
      {
        id: "custom-invalid-duration",
        name: "Bad Duration",
        title: "Bad Duration",
        duration_minutes: 0,
        start_time: "11:00:00",
        category: "meeting",
        participants: "",
      },
      {
        id: "custom-invalid-time",
        name: "Bad Time",
        title: "Bad Time",
        duration_minutes: 30,
        start_time: "99:99:99",
        category: "meeting",
        participants: "",
      },
    ]));

    expect(getCustomTemplates()).toHaveLength(1);
    expect(getCustomTemplates()[0].id).toBe("custom-valid");
  });

  it("normalizes saved custom templates before storing them", () => {
    const saved = saveTemplate({
      name: "Huge Planning",
      title: "Huge Planning",
      duration_minutes: 9999,
      start_time: "bad-time",
      category: "",
      participants: "",
    });

    expect(saved).toEqual(expect.objectContaining({
      duration_minutes: 480,
      start_time: "09:00:00",
      category: null,
    }));
    expect(getCustomTemplates()[0]).toEqual(saved);
  });

  it("does not crash when browser storage rejects custom templates", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() => saveTemplate({
      name: "Planning",
      title: "Planning",
      duration_minutes: 30,
      start_time: "10:00:00",
      category: "meeting",
      participants: "",
    })).not.toThrow();
  });

  it("uses the local calendar date when applying a template without an explicit date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 7, 0, 30));

    const applied = applyTemplate({
      id: "custom-planning",
      name: "Planning",
      title: "Planning",
      duration_minutes: 30,
      start_time: "10:00:00",
      category: "meeting",
      participants: "",
    });

    expect(applied.date).toBe("2026-07-07");
  });
});
