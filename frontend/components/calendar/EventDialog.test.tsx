import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventDialog } from "./EventDialog";

describe("EventDialog", () => {
  it("keeps desktop dialog centering while exposing rich event fields", () => {
    render(
      <EventDialog
        open
        onOpenChange={vi.fn()}
        initialData={null}
        onSave={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");

    expect(dialog.className).not.toContain("sm:static");
    expect(dialog.className).toContain("sm:-translate-x-1/2");
    expect(screen.getByLabelText("Deskripsi")).toBeVisible();
    expect(screen.getByLabelText("Meeting link")).toBeVisible();
    expect(screen.getByLabelText("Priority")).toBeVisible();
    expect(screen.getByLabelText("Reminder")).toBeVisible();
    expect(screen.getByLabelText("Tags")).toBeVisible();
  });
});
