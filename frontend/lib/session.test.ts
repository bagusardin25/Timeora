import { afterEach, describe, expect, it } from "vitest";

import { getAccountInitials, getTokenEmail } from "./session";

function encodeJwtPayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const base64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `header.${base64}.signature`;
}

describe("getAccountInitials", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("uses first two letters of a single-name email local part", () => {
    expect(getAccountInitials("ellisa@example.com")).toBe("EL");
  });

  it("uses first letters of dotted email local parts", () => {
    expect(getAccountInitials("john.doe@example.com")).toBe("JD");
  });

  it("uses name words when a display name is provided", () => {
    expect(getAccountInitials("Ellisa Putri")).toBe("EP");
  });

  it("reads initials from the access token email claim", () => {
    localStorage.setItem(
      "token",
      encodeJwtPayload({ email: "ellisa@timeora.app" }),
    );
    expect(getAccountInitials()).toBe("EL");
    expect(getTokenEmail()).toBe("ellisa@timeora.app");
  });
});
