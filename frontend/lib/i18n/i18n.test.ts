import { describe, expect, it } from "vitest";

import { getDictionary, translate } from "./dictionaries";
import { DEFAULT_LOCALE } from "./types";

describe("i18n dictionaries", () => {
  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(translate(getDictionary("en"), "assistant.title")).toBe("Ask your calendar");
  });

  it("translates Indonesian keys", () => {
    expect(translate(getDictionary("id"), "assistant.title")).toBe("Tanya kalender");
  });

  it("interpolates variables", () => {
    expect(translate(getDictionary("en"), "assistant.minutes", { n: 30 })).toBe("30 min");
    expect(translate(getDictionary("id"), "assistant.minutes", { n: 30 })).toBe("30 menit");
  });

  it("has matching top-level sections in en and id", () => {
    const en = getDictionary("en");
    const id = getDictionary("id");
    expect(Object.keys(id).sort()).toEqual(Object.keys(en).sort());
  });
});
