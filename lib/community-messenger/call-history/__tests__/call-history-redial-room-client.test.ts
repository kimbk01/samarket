/**
 * Call history redial (client) — room resolved by the server before any launch lane
 * (web / iOS / Android native all receive the resolved roomId).
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const openSheetMock = vi.fn();
vi.mock("@/lib/auth/phone-verification-required-client", () => ({
  openPhoneVerificationRequiredSheet: (...args: unknown[]) => openSheetMock(...args),
}));
vi.mock("@/lib/auth/assert-phone-verified-for-messenger-action-client", () => ({
  resolveMessengerActionReturnPath: () => "/community-messenger",
}));

import {
  CALL_HISTORY_REDIAL_ROOM_API_PATH,
  resolveCallHistoryRedialRoomClient,
} from "@/lib/community-messenger/call-history/call-history-redial-room-client";

const ROOT = path.resolve(__dirname, "../../../..");

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("resolveCallHistoryRedialRoomClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    openSheetMock.mockClear();
  });

  it("posts peer + historic room and returns the server-resolved room", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true, roomId: "room-gd", source: "canonical_direct" });
    const result = await resolveCallHistoryRedialRoomClient({ peerUserId: "peer-1", roomId: "room-stale" });
    expect(result).toEqual({ ok: true, roomId: "room-gd", source: "canonical_direct" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CALL_HISTORY_REDIAL_ROOM_API_PATH);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ peerUserId: "peer-1", roomId: "room-stale" });
  });

  it("returns an explicit failure with a user message on server rejection", async () => {
    mockFetchOnce(400, { ok: false, error: "room_unavailable" });
    const result = await resolveCallHistoryRedialRoomClient({ peerUserId: null, roomId: "room-x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("room_unavailable");
      expect(result.userMessage.length).toBeGreaterThan(0);
    }
  });

  it("opens the phone verification sheet instead of alerting", async () => {
    mockFetchOnce(403, { ok: false, error: "PHONE_VERIFICATION_REQUIRED", code: "PHONE_VERIFICATION_REQUIRED" });
    const result = await resolveCallHistoryRedialRoomClient({ peerUserId: "peer-1", roomId: null });
    expect(result).toEqual(expect.objectContaining({ ok: false, phoneVerificationRequired: true }));
    expect(openSheetMock).toHaveBeenCalledTimes(1);
  });
});

describe("MessengerCallLogsPanel redial contract", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "components/community-messenger/MessengerCallLogsPanel.tsx"),
    "utf8"
  );

  it("resolves the room on the server before launchOutgoingDirectCall", () => {
    const resolveIdx = src.indexOf("resolveCallHistoryRedialRoomClient(");
    const launchIdx = src.indexOf("launchOutgoingDirectCall(");
    expect(resolveIdx).toBeGreaterThan(0);
    expect(launchIdx).toBeGreaterThan(resolveIdx);
    expect(src).toMatch(/roomId:\s*resolved\.roomId/);
  });

  it("does not borrow another call log row's room for the peer", () => {
    expect(src).not.toContain("resolveRoomIdForPeer");
    expect(src).not.toMatch(/calls\.find\([^)]*peerUserId[^)]*roomId/);
  });

  it("routes an in-progress call guard to the active call like home", () => {
    expect(src).toContain("navigateBlockedOutgoingCall(router, guard.blockedCallId)");
  });
});
