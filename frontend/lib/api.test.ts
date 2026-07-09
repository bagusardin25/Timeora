import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, exportIcs, fetchApi } from "./api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchApi", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls same-origin API without a client abort timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchApi("/health");

    expect(fetchMock).toHaveBeenCalledOnce();
    // Relative /backend-api intentionally omits AbortSignal timeouts.
    expect(fetchMock.mock.calls[0][1]?.signal).toBeUndefined();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/backend-api/health");
  });

  it("honors an already-aborted caller signal before sending requests", async () => {
    const controller = new AbortController();
    controller.abort("closed");
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return Promise.resolve(jsonResponse(200, { ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    // Caller abort is not a server timeout (status 408); it is a cancellation.
    await expect(fetchApi("/health", { signal: controller.signal })).rejects.toMatchObject({
      status: 0,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("clears stale credentials when refresh is rejected", async () => {
    localStorage.setItem("token", "expired-access");
    localStorage.setItem("refresh_token", "expired-refresh");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: "invalid refresh" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/events")).rejects.toBeInstanceOf(ApiError);

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });

  it("retries auth refresh without requiring a client abort signal", async () => {
    localStorage.setItem("token", "expired-access");
    localStorage.setItem("refresh_token", "expired-refresh");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: "invalid refresh" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/events")).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/refresh");
  });

  it("clears a stale access token when no refresh token is available", async () => {
    localStorage.setItem("token", "expired-access");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { detail: "expired" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/events")).rejects.toBeInstanceOf(ApiError);

    expect(localStorage.getItem("token")).toBeNull();
  });

  it("uses a plain-text server error instead of a generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Service is warming up", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await expect(fetchApi("/events")).rejects.toMatchObject({
      status: 503,
      message: "Service is warming up",
    });
  });

  it("returns null for successful empty responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(fetchApi("/events/one", { method: "DELETE" })).resolves.toBeNull();
  });

  it("refreshes stale credentials before retrying calendar export", async () => {
    localStorage.setItem("token", "expired-access");
    localStorage.setItem("refresh_token", "valid-refresh");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "fresh-access" }))
      .mockResolvedValueOnce(
        new Response("BEGIN:VCALENDAR", {
          status: 200,
          headers: { "Content-Type": "text/calendar" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const blob = await exportIcs();

    expect(await blob.text()).toBe("BEGIN:VCALENDAR");
    expect(localStorage.getItem("token")).toBe("fresh-access");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Authorization: "Bearer expired-access",
    });
    expect(fetchMock.mock.calls[2][1]?.headers).toEqual({
      Authorization: "Bearer fresh-access",
    });
  });

  it("exports calendar via same-origin API without client abort timeout", async () => {
    localStorage.setItem("token", "valid-access");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("BEGIN:VCALENDAR", {
        status: 200,
        headers: { "Content-Type": "text/calendar" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await exportIcs();

    expect(fetchMock.mock.calls[0][1]?.signal).toBeUndefined();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/backend-api/export/ics");
  });
});
