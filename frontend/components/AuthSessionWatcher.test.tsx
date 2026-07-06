import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { AuthSessionWatcher } from "./AuthSessionWatcher";

describe("AuthSessionWatcher", () => {
  it("redirects to login when the API client reports an expired session", () => {
    render(<AuthSessionWatcher />);

    window.dispatchEvent(new CustomEvent("timeora:auth-expired"));

    expect(router.replace).toHaveBeenCalledWith("/login");
  });
});
