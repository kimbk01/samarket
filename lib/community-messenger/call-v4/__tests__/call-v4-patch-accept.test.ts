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
});
