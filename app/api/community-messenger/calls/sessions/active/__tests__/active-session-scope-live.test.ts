import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ringing = { id: "s-ring", roomId: "r1", status: "ringing", isMineInitiator: true };
const getLive = vi.fn(async () => ringing);
const getActive = vi.fn(async () => null);
const reconcile = vi.fn(async () => {});

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/http/api-route", async (orig) => ({
  ...(await orig<typeof import("@/lib/http/api-route")>()),
  enforceRateLimit: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/service", () => ({
  getLiveDirectCallSessionForUser: (...a: unknown[]) => getLive(...(a as [])),
  getActiveDirectCallSessionForUser: (...a: unknown[]) => getActive(...(a as [])),
  reconcileUserLiveCallSessions: (...a: unknown[]) => reconcile(...(a as [])),
}));

import { GET } from "@/app/api/community-messenger/calls/sessions/active/route";

/** android-caller-stuck-after-remote-missed-design §14-1 C-M4 — 네이티브 발신 준비 감시용 live 조회 */
describe("GET /calls/sessions/active — scope=live", () => {
  beforeEach(() => {
    getLive.mockClear();
    getActive.mockClear();
    reconcile.mockClear();
  });

  it("scope=live → 울리는 중 통화까지 (live 조회만)", async () => {
    const res = await GET(new NextRequest("http://localhost/api/community-messenger/calls/sessions/active?scope=live"));
    expect(await res.json()).toEqual({ ok: true, session: ringing });
    expect(getLive).toHaveBeenCalledWith("u1");
    expect(getActive).not.toHaveBeenCalled();
  });

  it("파라미터 없음 → 기존 active 전용 응답 그대로", async () => {
    const res = await GET(new NextRequest("http://localhost/api/community-messenger/calls/sessions/active"));
    expect(await res.json()).toEqual({ ok: true, session: null });
    expect(reconcile).toHaveBeenCalledWith("u1", "active_route");
    expect(getActive).toHaveBeenCalledWith("u1");
    expect(getLive).not.toHaveBeenCalled();
  });
});
