import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const start = vi.fn();
const dispatch = vi.fn();
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/auth/server-guards", () => ({ requirePhoneVerified: async () => ({ ok: true }) }));
vi.mock("@/lib/http/api-route", async (orig) => ({
  ...(await orig<typeof import("@/lib/http/api-route")>()),
  enforceRateLimit: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/server/messenger-room-canonical-resolve-api", () => ({
  messengerRoomCanonicalOrJsonError: async () => ({ ok: true, canonicalRoomId: "room-1" }),
}));
vi.mock("@/lib/community-messenger/incoming-call-voip-dispatch", () => ({
  startIncomingCallVoipDispatchDetached: (...a: unknown[]) => dispatch(...a),
}));
vi.mock("@/lib/community-messenger/service", () => ({
  reconcileUserLiveCallSessions: async () => undefined,
  startCommunityMessengerCallSession: (...a: unknown[]) => start(...a),
}));

import { POST } from "@/app/api/community-messenger/rooms/[roomId]/calls/route";

const A = "6f106d55-77aa-4b18-b2c8-efe5311751ed";
const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/community-messenger/rooms/room-1/calls", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ roomId: "room-1" }) }
  );

/** android-caller-stuck-after-remote-missed-design §15-4 — 생성 요청의 발신 시도 ID */
describe("POST rooms/[roomId]/calls — clientAttemptId", () => {
  beforeEach(() => {
    start.mockReset();
    dispatch.mockReset();
  });

  it("시도 ID 를 서비스로 넘긴다 · 없으면 null(기존 동작)", async () => {
    start.mockResolvedValue({ ok: true, session: { id: "s1", status: "ringing" }, incomingCallPush: null });
    await post({ callKind: "voice", dialIntent: "fresh", clientAttemptId: A });
    expect(start.mock.calls[0]?.[0]).toMatchObject({ userId: "u1", roomId: "room-1", clientAttemptId: A });
    await post({ callKind: "voice", dialIntent: "fresh" });
    expect(start.mock.calls[1]?.[0]).toMatchObject({ clientAttemptId: null });
  });

  it("취소·종료된 시도 → 409, 푸시 없음", async () => {
    for (const error of ["call_attempt_cancelled", "call_attempt_ended"]) {
      start.mockResolvedValueOnce({ ok: false, error });
      const res = await post({ callKind: "voice", dialIntent: "fresh", clientAttemptId: A });
      expect(res.status).toBe(409);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });
});
