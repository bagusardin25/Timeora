import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { exportIcs } from "@/lib/api";
import ProfilePage from "./page";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => createElement("img", {
    alt: props.alt ?? "",
    ...props,
  }),
}));

vi.mock("@/lib/api", () => ({
  exportIcs: vi.fn(),
}));

const exportIcsMock = vi.mocked(exportIcs);

describe("ProfilePage", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "not-a-real-jwt");
    router.push.mockClear();
    router.replace.mockClear();
    exportIcsMock.mockReset();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:timeora-export"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("exports profile data through the shared calendar export client", async () => {
    const user = userEvent.setup();
    exportIcsMock.mockResolvedValue(new Blob(["BEGIN:VCALENDAR"]));

    render(<ProfilePage />);

    await user.click(screen.getByRole("button", { name: /^Export$/ }));

    expect(exportIcsMock).toHaveBeenCalledOnce();
    expect(await screen.findByText("Data exported successfully!")).toBeVisible();
  });
});
