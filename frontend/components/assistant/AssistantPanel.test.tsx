import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callAssistant, executeAssistant } from "@/lib/api";
import { AssistantPanel } from "./AssistantPanel";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    callAssistant: vi.fn(),
    executeAssistant: vi.fn(),
  };
});

const callAssistantMock = vi.mocked(callAssistant);
const executeAssistantMock = vi.mocked(executeAssistant);

describe("AssistantPanel", () => {
  beforeEach(() => {
    callAssistantMock.mockReset();
    executeAssistantMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits from a visible Send button and renders feedback", async () => {
    const user = userEvent.setup();
    callAssistantMock.mockResolvedValue({
      intent: "query",
      result: [],
      events: [],
      suggested_actions: [],
      message: "I found 3 events today.",
    });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Apa jadwal saya hari ini?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(callAssistantMock).toHaveBeenCalledWith("Apa jadwal saya hari ini?", undefined);
    expect(await screen.findByText("I found 3 events today.")).toBeVisible();
  });

  it("still submits on browsers without crypto.randomUUID", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", {});
    callAssistantMock.mockResolvedValue({
      intent: "query",
      result: [],
      events: [],
      suggested_actions: [],
      message: "Fallback IDs still work.",
    });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Apa jadwal saya?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(callAssistantMock).toHaveBeenCalledWith("Apa jadwal saya?", undefined);
    expect(await screen.findByText("Fallback IDs still work.")).toBeVisible();
  });

  it("renders clarification choices and resubmits with the selected event", async () => {
    const user = userEvent.setup();
    callAssistantMock
      .mockResolvedValueOnce({
        intent: "cancel",
        result: { events: [] },
        message: "Which event did you mean?",
        clarification: {
          type: "event_selection",
          prompt: "Which team meeting did you mean?",
          choices: [
            { id: "one", title: "Marketing Sync", start_time: "10:00:00" },
            { id: "two", title: "Product Sync", start_time: "14:00:00" },
          ],
        },
      })
      .mockResolvedValueOnce({
        intent: "cancel",
        result: { primary_event_id: "two", primary_title: "Product Sync" },
        message: "Cancel Product Sync?",
        requires_confirmation: true,
      });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Batalkan team sync");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: /Product Sync/ }));

    expect(callAssistantMock).toHaveBeenLastCalledWith("Batalkan team sync", {
      selected_event_id: "two",
    });
    expect(await screen.findByRole("button", { name: "Confirm action" })).toBeVisible();
  });

  it("confirms native update tool results with event data", async () => {
    const user = userEvent.setup();
    const onEventsChanged = vi.fn();
    callAssistantMock.mockResolvedValueOnce({
      intent: "update",
      result: {
        primary_event_id: "event-1",
        event_data: { description: "Updated prep notes", priority: "important" },
      },
      message: "Update Product Sync?",
      requires_confirmation: true,
    });
    executeAssistantMock.mockResolvedValueOnce({
      intent: "update",
      result: { id: "event-1", title: "Product Sync" },
      message: "Event updated.",
      executed: true,
    });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={onEventsChanged} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Make Product Sync important");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Confirm action" }));

    expect(executeAssistantMock).toHaveBeenCalledWith({
      action: "update",
      event_id: "event-1",
      event_data: { description: "Updated prep notes", priority: "important" },
    });
    expect(onEventsChanged).toHaveBeenCalled();
  });

  it("confirms create with executeAssistant and event_data", async () => {
    const user = userEvent.setup();
    const onEventsChanged = vi.fn();
    const eventData = {
      title: "Team Standup",
      date: "2026-07-10",
      start_time: "09:00:00",
      duration_minutes: 30,
    };
    callAssistantMock.mockResolvedValueOnce({
      intent: "create",
      result: { event_data: eventData },
      message: "Create Team Standup?",
      requires_confirmation: true,
    });
    executeAssistantMock.mockResolvedValueOnce({
      intent: "create",
      result: { id: "new-1", title: "Team Standup" },
      message: "Event created.",
      executed: true,
    });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={onEventsChanged} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Jadwalkan Team Standup besok jam 9");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(callAssistantMock).toHaveBeenCalledWith("Jadwalkan Team Standup besok jam 9", undefined);
    await user.click(await screen.findByRole("button", { name: "Confirm action" }));

    expect(executeAssistantMock).toHaveBeenCalledWith({
      action: "create",
      event_data: eventData,
    });
    expect(onEventsChanged).toHaveBeenCalled();
  });

  it("confirms reschedule with executeAssistant new_date and new_time", async () => {
    const user = userEvent.setup();
    const onEventsChanged = vi.fn();
    callAssistantMock.mockResolvedValueOnce({
      intent: "reschedule",
      result: {
        primary_event_id: "event-rs",
        new_date: "2026-07-11",
        new_time: "15:00:00",
      },
      message: "Reschedule Product Sync to 3pm?",
      requires_confirmation: true,
    });
    executeAssistantMock.mockResolvedValueOnce({
      intent: "reschedule",
      result: { id: "event-rs", title: "Product Sync" },
      message: "Event rescheduled.",
      executed: true,
    });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={onEventsChanged} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Pindahkan Product Sync ke jam 3");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Confirm action" }));

    expect(executeAssistantMock).toHaveBeenCalledWith({
      action: "reschedule",
      event_id: "event-rs",
      new_date: "2026-07-11",
      new_time: "15:00:00",
    });
    expect(onEventsChanged).toHaveBeenCalled();
  });

  it("confirms cancel with executeAssistant and event_id", async () => {
    const user = userEvent.setup();
    const onEventsChanged = vi.fn();
    callAssistantMock.mockResolvedValueOnce({
      intent: "cancel",
      result: {
        primary_event_id: "event-cancel",
        primary_title: "Marketing Sync",
      },
      message: "Cancel Marketing Sync?",
      requires_confirmation: true,
    });
    executeAssistantMock.mockResolvedValueOnce({
      intent: "cancel",
      result: { id: "event-cancel", title: "Marketing Sync" },
      message: "Event cancelled.",
      executed: true,
    });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={onEventsChanged} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Batalkan Marketing Sync");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Confirm action" }));

    expect(executeAssistantMock).toHaveBeenCalledWith({
      action: "cancel",
      event_id: "event-cancel",
    });
    expect(onEventsChanged).toHaveBeenCalled();
  });

  type RecognitionHandlers = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: (() => void) | null;
    onresult: ((event: {
      resultIndex: number;
      results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
    }) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };

  function createSpeechRecognitionMock() {
    let recognition: RecognitionHandlers | null = null;
    const SpeechRecognitionMock = vi.fn(function SpeechRecognitionMock(this: RecognitionHandlers) {
      recognition = this;
      this.continuous = false;
      this.interimResults = false;
      this.lang = "";
      this.onstart = null;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.start = vi.fn(() => {
        this.onstart?.();
      });
      this.stop = vi.fn(() => {
        this.onend?.();
      });
    });
    vi.stubGlobal("SpeechRecognition", SpeechRecognitionMock);
    return {
      SpeechRecognitionMock,
      getRecognition: () => recognition,
    };
  }

  it("fills the textarea from voice input transcript without auto-submit", async () => {
    const user = userEvent.setup();
    const { SpeechRecognitionMock, getRecognition } = createSpeechRecognitionMock();
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Start voice input" }));

    const recognition = getRecognition();
    expect(SpeechRecognitionMock).toHaveBeenCalled();
    expect(recognition).not.toBeNull();
    expect(recognition!.lang).toBe("id-ID");
    expect(recognition!.start).toHaveBeenCalled();

    await act(async () => {
      recognition!.onresult?.({
        resultIndex: 0,
        results: [[{ transcript: "Apa jadwal saya hari ini" }]],
      });
      recognition!.onend?.();
    });

    expect(screen.getByPlaceholderText("Ask or type a message…")).toHaveValue("Apa jadwal saya hari ini");
    expect(callAssistantMock).not.toHaveBeenCalled();
  });

  it("replaces progressive voice transcripts instead of stacking them", async () => {
    const user = userEvent.setup();
    const { getRecognition } = createSpeechRecognitionMock();
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    const input = screen.getByPlaceholderText("Ask or type a message…");
    await user.type(input, "Catatan:");
    await user.click(screen.getByRole("button", { name: "Start voice input" }));

    const recognition = getRecognition();
    const progressive = [
      "Oke",
      "Oke untuk",
      "Oke untuk jadwal",
      "Oke untuk jadwal hari ini",
      "Oke untuk jadwal hari ini apa aja yang sudah selesai",
    ];

    await act(async () => {
      for (const transcript of progressive) {
        recognition!.onresult?.({
          resultIndex: 0,
          results: [Object.assign([{ transcript }], { isFinal: false })],
        });
      }
      recognition!.onresult?.({
        resultIndex: 0,
        results: [
          Object.assign(
            [{ transcript: "Oke untuk jadwal hari ini apa aja yang sudah selesai" }],
            { isFinal: true },
          ),
        ],
      });
      recognition!.onend?.();
    });

    expect(input).toHaveValue("Catatan: Oke untuk jadwal hari ini apa aja yang sudah selesai");
    expect(callAssistantMock).not.toHaveBeenCalled();
  });

  it("shows a short error when the browser lacks speech recognition", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Start voice input" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Browser tidak mendukung input suara.");
  });

  it("does not offer confirmation when the assistant action payload is incomplete", async () => {
    const user = userEvent.setup();
    callAssistantMock.mockResolvedValueOnce({
      intent: "create",
      result: {},
      message: "Create this event?",
      requires_confirmation: true,
    });
    render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ask or type a message…"), "Jadwalkan sesuatu");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Create this event?")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm action" })).not.toBeInTheDocument();
  });

  it("supports older Android WebView media query listeners", () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 767px)",
      onchange: null,
      addListener,
      removeListener,
      dispatchEvent: () => false,
    }));

    const { unmount } = render(<AssistantPanel open onOpenChange={vi.fn()} onEventsChanged={vi.fn()} />);

    expect(addListener).toHaveBeenCalledWith(expect.any(Function));

    unmount();

    expect(removeListener).toHaveBeenCalledWith(expect.any(Function));
  });
});
