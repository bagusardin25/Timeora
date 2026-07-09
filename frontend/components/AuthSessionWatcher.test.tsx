import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/dashboard",
}));

import { AuthSessionWatcher } from "./AuthSessionWatcher";

describe("AuthSessionWatcher", () => {
  it("redirects to login when the API client reports an expired session", () => {
    localStorage.setItem("token", "stale");
    localStorage.setItem("refresh_token", "stale-refresh");
    render(<AuthSessionWatcher />);

    window.dispatchEvent(new CustomEvent("timeora:auth-expired"));

    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });
});
