import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/** 설계 2026-11-21 §4 C — 친구 요청: 수락만 가입 필요, 거절·취소는 가입 없이 */
const h = vi.hoisted(() => ({ gate: null as unknown, respond: vi.fn(), respondIncoming: vi.fn() }));
vi.mock("@/lib/auth/api-session", () => ({ requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }) }));
vi.mock("@/lib/http/api-route", () => ({ enforceRateLimit: async () => ({ ok: true }), getRateLimitKey: () => "k" }));
vi.mock("@/lib/community-messenger/service", () => ({
  respondCommunityMessengerFriendRequest: h.respond,
  respondIncomingCommunityMessengerFriendRequestByRequester: h.respondIncoming,
}));
vi.mock("@/lib/auth/require-registration-for-action.server", () => ({
  requireRegistrationForAction: async () => h.gate,
}));

import { PATCH } from "@/app/api/community-messenger/friend-requests/[requestId]/route";
import { POST as respondIncoming } from "@/app/api/community-messenger/friend-requests/respond-incoming/route";

const patchReq = (action: string) =>
  new NextRequest("http://localhost/api/community-messenger/friend-requests/r1", {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
const incomingReq = (action: string) =>
  new NextRequest("http://localhost/api/community-messenger/friend-requests/respond-incoming", {
    method: "POST",
    body: JSON.stringify({ requesterId: "u2", action }),
  });
const ctx = { params: Promise.resolve({ requestId: "r1" }) };

describe("친구 요청 응답 — 섞인 경로", () => {
  beforeEach(() => {
    h.gate = NextResponse.json({ ok: false, code: "signup_incomplete", step: "address" }, { status: 403 });
    h.respond.mockReset().mockResolvedValue({ ok: true });
    h.respondIncoming.mockReset().mockResolvedValue({ ok: true });
  });

  it("가입 진행 중: 수락은 403 (처리 함수 호출 없음)", async () => {
    const res = await PATCH(patchReq("accept"), ctx);
    expect(res.status).toBe(403);
    expect(h.respond).not.toHaveBeenCalled();
    const res2 = await respondIncoming(incomingReq("accept"));
    expect(res2.status).toBe(403);
    expect(h.respondIncoming).not.toHaveBeenCalled();
  });

  it("가입 진행 중: 거절·취소는 처리된다", async () => {
    expect((await PATCH(patchReq("reject"), ctx)).status).toBe(200);
    expect((await PATCH(patchReq("cancel"), ctx)).status).toBe(200);
    expect((await respondIncoming(incomingReq("reject"))).status).toBe(200);
    expect(h.respond).toHaveBeenCalledTimes(2);
    expect(h.respondIncoming).toHaveBeenCalledTimes(1);
  });

  it("가입 완료: 수락 처리", async () => {
    h.gate = null;
    expect((await PATCH(patchReq("accept"), ctx)).status).toBe(200);
  });
});
