import { describe, expect, it } from "vitest";

import { getCustomTemplates, saveTemplate } from "./templates";

describe("templates", () => {
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
});
