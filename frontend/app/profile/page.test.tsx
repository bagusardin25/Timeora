import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ImgHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads email from base64url encoded JWT payloads", async () => {
    const payloadWithBase64UrlCharacter =
      "eyJlbWFpbCI6ImZyZWRkeS10YW1hQGV4YW1wbGUuY29tIiwibmFtZSI6IsK-In0";
    localStorage.setItem("token", `header.${payloadWithBase64UrlCharacter}.signature`);

    render(<ProfilePage />);

    expect(await screen.findByText("freddy-tama@example.com")).toBeVisible();
  });

  it("exports profile data through the shared calendar export client", async () => {
    const user = userEvent.setup();
    exportIcsMock.mockResolvedValue(new Blob(["BEGIN:VCALENDAR"]));

    render(<ProfilePage />);

    await user.click(screen.getByRole("button", { name: /^Export$/ }));

    expect(exportIcsMock).toHaveBeenCalledOnce();
    expect(await screen.findByText("Data exported successfully!")).toBeVisible();
  });

  it("attaches export download links before clicking for mobile browser compatibility", async () => {
    const user = userEvent.setup();
    const appendSpy = vi.spyOn(document.body, "appendChild");
    exportIcsMock.mockResolvedValue(new Blob(["BEGIN:VCALENDAR"]));

    render(<ProfilePage />);

    await user.click(screen.getByRole("button", { name: /^Export$/ }));
    await screen.findByText("Data exported successfully!");

    const appendedLink = appendSpy.mock.calls
      .map(([node]) => node)
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);

    expect(appendedLink).toBeDefined();
    expect(appendedLink?.href).toBe("blob:timeora-export");
    expect(appendedLink?.download).toBe("timeora-full-export.ics");
    expect(document.querySelector('a[download="timeora-full-export.ics"]')).toBeNull();
  });
});
