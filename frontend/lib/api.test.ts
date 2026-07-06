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

  it("attaches an abort signal so stalled production requests can time out", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchApi("/health");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
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

  it("attaches an abort signal to token refresh requests", async () => {
    localStorage.setItem("token", "expired-access");
    localStorage.setItem("refresh_token", "expired-refresh");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: "invalid refresh" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/events")).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
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
});
