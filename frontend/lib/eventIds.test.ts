import { describe, expect, it } from "vitest";

import { baseEventId } from "./eventIds";

describe("baseEventId", () => {
  it("removes only the recurring instance date suffix", () => {
    expect(baseEventId("team_sync_2026-07-06")).toBe("team_sync");
  });

  it("leaves non-recurring ids with underscores intact", () => {
    expect(baseEventId("team_sync")).toBe("team_sync");
    expect(baseEventId("team_sync_draft")).toBe("team_sync_draft");
  });
});
