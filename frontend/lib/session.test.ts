import { beforeEach, describe, expect, it } from "vitest";

import { persistAuthTokens } from "./session";

describe("persistAuthTokens", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("clears stale refresh tokens when a new login response omits refresh_token", () => {
    localStorage.setItem("refresh_token", "old-refresh");

    persistAuthTokens({ access_token: "new-access" });

    expect(localStorage.getItem("token")).toBe("new-access");
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });

  it("can preserve the existing refresh token for refresh responses that only rotate access_token", () => {
    localStorage.setItem("refresh_token", "existing-refresh");

    persistAuthTokens(
      { access_token: "fresh-access" },
      { preserveRefreshToken: true },
    );

    expect(localStorage.getItem("token")).toBe("fresh-access");
    expect(localStorage.getItem("refresh_token")).toBe("existing-refresh");
  });
});
