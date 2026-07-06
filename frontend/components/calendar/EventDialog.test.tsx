import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("does not save blank-looking titles", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EventDialog
        open
        onOpenChange={vi.fn()}
        initialData={null}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText("Judul Event"), "   ");
    await user.click(screen.getByRole("button", { name: "Simpan Event" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("disables save until the event title is present", async () => {
    const user = userEvent.setup();
    render(
      <EventDialog
        open
        onOpenChange={vi.fn()}
        initialData={null}
        onSave={vi.fn()}
      />,
    );

    const titleInput = screen.getByLabelText("Judul Event");
    const saveButton = screen.getByRole("button", { name: "Simpan Event" });

    expect(saveButton).toBeDisabled();

    await user.type(titleInput, "Planning");

    expect(saveButton).toBeEnabled();

    await user.clear(titleInput);

    expect(saveButton).toBeDisabled();
  });

  it("calculates duration correctly for events that end after midnight", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EventDialog
        open
        onOpenChange={vi.fn()}
        initialData={null}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText("Judul Event"), "Late deployment");
    await user.clear(screen.getByLabelText("Mulai"));
    await user.type(screen.getByLabelText("Mulai"), "23:00");
    await user.clear(screen.getByLabelText("Selesai"));
    await user.type(screen.getByLabelText("Selesai"), "00:30");
    await user.click(screen.getByRole("button", { name: "Simpan Event" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      start_time: "23:00:00",
      duration_minutes: 90,
    }));
  });
});
