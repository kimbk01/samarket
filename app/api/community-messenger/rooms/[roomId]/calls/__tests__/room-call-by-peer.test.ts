import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * R5 (2026-11-09) — 방이 없는 상대 발신: `POST /rooms/by-peer/calls` 한 요청으로 방 확보 + 통화 생성.
 * 문서: `docs/audit/call-residual-risk-design-2026-11-09.md` §2 R5.
 */

const start = vi.fn();
const dispatch = vi.fn();
const ensurePeer = vi.fn();
const canonical = vi.fn();

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/auth/server-guards", () => ({ requirePhoneVerified: async () => ({ ok: true }) }));
vi.mock("@/lib/http/api-route", async (orig) => ({
  ...(await orig<typeof import("@/lib/http/api-route")>()),
  enforceRateLimit: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/server/messenger-room-canonical-resolve-api", () => ({
  messengerRoomCanonicalOrJsonError: (...a: unknown[]) => canonical(...a),
}));
vi.mock("@/lib/community-messenger/server/ensure-peer-direct-room-for-call", async () => ({
  ...(await import("@/lib/community-messenger/peer-direct-call-room-segment")),
  ensurePeerDirectRoomForCall: (...a: unknown[]) => ensurePeer(...a),
}));
vi.mock("@/lib/community-messenger/incoming-call-voip-dispatch", () => ({
  startIncomingCallVoipDispatchDetached: (...a: unknown[]) => dispatch(...a),
}));
vi.mock("@/lib/community-messenger/service", () => ({
  reconcileUserLiveCallSessions: async () => undefined,
  startCommunityMessengerCallSession: (...a: unknown[]) => start(...a),
}));

import { POST } from "@/app/api/community-messenger/rooms/[roomId]/calls/route";

const post = (roomId: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/community-messenger/rooms/${roomId}/calls`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ roomId }) },
  );

describe("POST rooms/by-peer/calls (R5)", () => {
  beforeEach(() => {
    start.mockReset();
    dispatch.mockReset();
    ensurePeer.mockReset();
    canonical.mockReset();
    canonical.mockImplementation(async (_u: string, rid: string) => ({ ok: true, canonicalRoomId: rid }));
  });

  it("상대 ID 로 방 확보 → 같은 요청에서 통화 생성 · 응답에 roomId", async () => {
    ensurePeer.mockResolvedValue({ ok: true, roomId: "room-new" });
    start.mockResolvedValue({
      ok: true,
      session: { id: "s1", status: "ringing", roomId: "room-new" },
      incomingCallPush: { x: 1 },
    });
    const res = await post("by-peer", { callKind: "video", dialIntent: "fresh", peerUserId: "peer-1" });
    const json = (await res.json()) as Record<string, unknown>;
    expect(ensurePeer.mock.calls[0]?.[1]).toBe("u1");
    expect(ensurePeer.mock.calls[0]?.[2]).toBe("peer-1");
    expect(canonical.mock.calls[0]?.[1]).toBe("room-new");
    expect(start.mock.calls[0]?.[0]).toMatchObject({ userId: "u1", roomId: "room-new", callKind: "video" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(json).toMatchObject({ ok: true, callId: "s1", roomId: "room-new" });
  });

  it("방 확보 실패 → 그 응답 그대로, 통화 생성·푸시 없음", async () => {
    ensurePeer.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "cannot_start_chat", roomError: true }, { status: 403 }),
    });
    const res = await post("by-peer", { callKind: "voice", peerUserId: "peer-1" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "cannot_start_chat", roomError: true });
    expect(start).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("통화 생성 실패(peer_busy)에도 확보한 roomId 를 싣는다 (발신자 통화 중 안내 기록용)", async () => {
    ensurePeer.mockResolvedValue({ ok: true, roomId: "room-new" });
    start.mockResolvedValue({ ok: false, error: "peer_busy", busyKind: "peer" });
    const res = await post("by-peer", { callKind: "voice", peerUserId: "peer-1" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "peer_busy", roomId: "room-new" });
  });

  it("일반 방 ID 경로는 기존 그대로 — 방 확보 없음, 응답에 roomId 추가 없음", async () => {
    start.mockResolvedValue({ ok: true, session: { id: "s2", status: "ringing" }, incomingCallPush: null });
    const res = await post("room-1", { callKind: "voice", peerUserId: "ignored" });
    const json = (await res.json()) as Record<string, unknown>;
    expect(ensurePeer).not.toHaveBeenCalled();
    expect(start.mock.calls[0]?.[0]).toMatchObject({ roomId: "room-1" });
    expect("roomId" in json).toBe(false);
  });
});
