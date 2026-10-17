import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  callV4PatchAccept,
  isCallV4AcceptPatchJoinableStatus,
} from "@/lib/community-messenger/call-v4/call-v4-api";

function mockAcceptPatchFetch(input: {
  httpStatus?: number;
  ok?: boolean;
  session?: { id: string; status: string; callKind: string };
  error?: string;
}) {
  const httpStatus = input.httpStatus ?? (input.ok === false ? 400 : 200);
  const body = {
    ok: input.ok ?? true,
    session: input.session,
    error: input.error,
  };
  return vi.fn(async () => ({
    ok: httpStatus >= 200 && httpStatus < 300,
    status: httpStatus,
    json: async () => body,
  }));
}

describe("callV4PatchAccept", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("isCallV4AcceptPatchJoinableStatus allows ringing and active only", () => {
    expect(isCallV4AcceptPatchJoinableStatus("ringing")).toBe(true);
    expect(isCallV4AcceptPatchJoinableStatus("active")).toBe(true);
    expect(isCallV4AcceptPatchJoinableStatus("missed")).toBe(false);
  });

  it("returns ok when patch succeeds with active status", async () => {
    vi.stubGlobal(
      "fetch",
      mockAcceptPatchFetch({
        session: { id: "c1", status: "active", callKind: "video" },
      }),
    );
    const result = await callV4PatchAccept("c1");
    expect(result.ok).toBe(true);
  });

  it("blocks terminal session even when patch HTTP returned ok", async () => {
    vi.stubGlobal(
      "fetch",
      mockAcceptPatchFetch({
        session: { id: "c1", status: "missed", callKind: "voice" },
      }),
    );
    const result = await callV4PatchAccept("c1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("accept_patch_terminal");
  });

  it("surfaces session_terminal from server", async () => {
    vi.stubGlobal(
      "fetch",
      mockAcceptPatchFetch({
        ok: false,
        httpStatus: 400,
        error: "session_terminal",
        session: { id: "c1", status: "missed", callKind: "video" },
      }),
    );
    const result = await callV4PatchAccept("c1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("session_terminal");
  });

  it("logs accept patch fetch lifecycle in order on success", async () => {
    vi.stubGlobal(
      "fetch",
      mockAcceptPatchFetch({
        session: { id: "c1", status: "active", callKind: "video" },
      }),
    );
    const logs: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      if (args[0] === "[DIBAY_CALL_V4]" && typeof args[1] === "string") {
        logs.push(args[1]);
      }
      originalInfo(...args);
    };
    try {
      await callV4PatchAccept("c1");
      const chain = [
        "accept_patch_http_start",
        "fetch_request_created",
        "fetch_request_sent",
        "fetch_response_received",
        "fetch_body_read",
        "accept_patch_http_done",
      ];
      for (let i = 0; i < chain.length - 1; i++) {
        expect(logs.indexOf(chain[i]!)).toBeGreaterThanOrEqual(0);
        expect(logs.indexOf(chain[i]!)).toBeLessThan(logs.indexOf(chain[i + 1]!));
      }
    } finally {
      console.info = originalInfo;
    }
  });

  it("logs fetch lifecycle before accept_patch_http_fail on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      mockAcceptPatchFetch({
        ok: false,
        httpStatus: 400,
        error: "session_terminal",
        session: { id: "c1", status: "missed", callKind: "video" },
      }),
    );
    const logs: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      if (args[0] === "[DIBAY_CALL_V4]" && typeof args[1] === "string") {
        logs.push(args[1]);
      }
      originalInfo(...args);
    };
    try {
      await callV4PatchAccept("c1");
      expect(logs.indexOf("fetch_body_read")).toBeLessThan(logs.indexOf("accept_patch_http_fail"));
    } finally {
      console.info = originalInfo;
    }
  });
});
