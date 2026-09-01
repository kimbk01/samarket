import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callV3FetchSessionForCallerPoll } from "@/lib/community-messenger/call-v3/call-v3-api";

describe("call-v3-caller-poll-api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caller polling uses no-store and cache-bust query", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        session: { id: "call-1", status: "ringing" },
      }),
    });

    const result = await callV3FetchSessionForCallerPoll("call-1");

    expect(result.session?.status).toBe("ringing");
    expect(result.notFound).toBe(false);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/community-messenger/calls/sessions/call-1");
    expect(url).toContain("ts=");
    expect(url).not.toContain("reconcile=1");
    expect(init.cache).toBe("no-store");
  });

  it("returns notFound for 404 session GET", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, error: "not_found" }),
    });

    const result = await callV3FetchSessionForCallerPoll("call-missing");

    expect(result.notFound).toBe(true);
    expect(result.httpStatus).toBe(404);
    expect(result.session).toBeNull();
  });
});
