import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventDialog } from "./EventDialog";

// Default locale is English (see lib/i18n/types.ts DEFAULT_LOCALE).
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
    expect(screen.getByLabelText("Description")).toBeVisible();
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

    await user.type(screen.getByLabelText("Event title"), "   ");
    await user.click(screen.getByRole("button", { name: "Save Event" }));

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

    const titleInput = screen.getByLabelText("Event title");
    const saveButton = screen.getByRole("button", { name: "Save Event" });

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

    await user.type(screen.getByLabelText("Event title"), "Late deployment");
    await user.clear(screen.getByLabelText("Start"));
    await user.type(screen.getByLabelText("Start"), "23:00");
    await user.clear(screen.getByLabelText("End"));
    await user.type(screen.getByLabelText("End"), "00:30");
    await user.click(screen.getByRole("button", { name: "Save Event" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      start_time: "23:00:00",
      duration_minutes: 90,
    }));
  });

  it("keeps the existing duration when only the start time changes", async () => {
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

    await user.type(screen.getByLabelText("Event title"), "Moved planning");
    await user.clear(screen.getByLabelText("Start"));
    await user.type(screen.getByLabelText("Start"), "11:00");
    await user.click(screen.getByRole("button", { name: "Save Event" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      start_time: "11:00:00",
      duration_minutes: 60,
    }));
    expect(screen.getByLabelText("End")).toHaveValue("12:00");
  });
});
