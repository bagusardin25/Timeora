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

  it("translates calendar add event button", () => {
    expect(translate(getDictionary("en"), "calendar.addEvent")).toBe("Add Event");
    expect(translate(getDictionary("id"), "calendar.addEvent")).toBe("Tambah Event");
    expect(translate(getDictionary("en"), "calendar.addEventShort")).toBe("Add");
    expect(translate(getDictionary("id"), "calendar.addEventShort")).toBe("Tambah");
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
