/**
 * GET /calls/sessions/:id — 응답 계약: 행 없음·참여자 아님 404 · 인증 401 · 요청 제한 429 · DB 일시 오류 503.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = {
  auth: true,
  rate: true,
  lookup: { kind: "not_found" } as { kind: string; session?: unknown },
  reconcile: vi.fn(),
};

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () =>
    state.auth
      ? { ok: true, userId: "u1" }
      : { ok: false, response: NextResponse.json({ ok: false, authenticated: false }, { status: 401 }) },
  requireAuthenticatedUserIdStrict: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/http/api-route", async (orig) => ({
  ...(await orig<typeof import("@/lib/http/api-route")>()),
  enforceRateLimit: async () =>
    state.rate ? { ok: true } : { ok: false, response: NextResponse.json({ ok: false }, { status: 429 }) },
}));
vi.mock("@/lib/community-messenger/service", () => ({
  lookupCommunityMessengerCallSessionById: async () => state.lookup,
  getCommunityMessengerCallSessionById: async () => null,
  reconcileUserLiveCallSessions: (...a: unknown[]) => state.reconcile(...a),
  updateCommunityMessengerCallSession: async () => ({ ok: false }),
  downgradeCommunityMessengerCallSessionToVoice: async () => ({ ok: false }),
  upgradeCommunityMessengerCallSessionToVideo: async () => ({ ok: false }),
}));

import { GET } from "@/app/api/community-messenger/calls/sessions/[sessionId]/route";

const SID = "6f106d55-77aa-4b18-b2c8-efe5311751ed";
const call = (q = "") =>
  GET(new NextRequest(`http://localhost/api/community-messenger/calls/sessions/${SID}${q}`), {
    params: Promise.resolve({ sessionId: SID }),
  });

describe("GET /calls/sessions/[sessionId]", () => {
  beforeEach(() => {
    state.auth = true;
    state.rate = true;
    state.lookup = { kind: "not_found" };
    state.reconcile.mockReset();
  });

  it("found → 200 + session", async () => {
    state.lookup = { kind: "found", session: { id: SID, status: "active" } };
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, session: { id: SID, status: "active" } });
  });

  it("행 없음 → 404 not_found", async () => {
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
  });

  it("참여자 아님 → 404 (존재 여부를 드러내지 않는 같은 응답)", async () => {
    state.lookup = { kind: "forbidden" };
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
  });

  it("DB 일시 오류 → 503 + Retry-After (404 아님)", async () => {
    state.lookup = { kind: "error" };
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("2");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("인증 만료 → 401 · 요청 제한 → 429", async () => {
    state.auth = false;
    expect((await call()).status).toBe(401);
    state.auth = true;
    state.rate = false;
    expect((await call()).status).toBe(429);
  });

  it("조회는 부작용 없음 — reconcile=1 일 때만 reconcile", async () => {
    await call();
    expect(state.reconcile).not.toHaveBeenCalled();
  });
});
