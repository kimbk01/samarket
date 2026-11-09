import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/** F1 (2026-11-09 감사) — 방 확보 단계의 모든 실패에 roomError, 상태 코드·헤더 유지. */

const gates = vi.hoisted(() => ({
  session: vi.fn(),
  signup: vi.fn(),
  profile: vi.fn(),
  rate: vi.fn(),
  ensure: vi.fn(),
}));

vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: (...a: unknown[]) => gates.session(...a) }));
vi.mock("@/lib/auth/require-signup-complete-api", () => ({
  requireSignupCompleteForUser: (...a: unknown[]) => gates.signup(...a),
}));
vi.mock("@/lib/profile/require-profile-completion.server", () => ({
  requireProfileFieldsForAction: (...a: unknown[]) => gates.profile(...a),
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));
vi.mock("@/lib/http/api-route", async (orig) => ({
  ...(await orig<typeof import("@/lib/http/api-route")>()),
  enforceRateLimit: (...a: unknown[]) => gates.rate(...a),
}));
vi.mock("@/lib/community-messenger/service", () => ({
  ensureGeneralFriendDirectRoom: (...a: unknown[]) => gates.ensure(...a),
}));

import { ensurePeerDirectRoomForCall } from "@/lib/community-messenger/server/ensure-peer-direct-room-for-call";

const req = new NextRequest("http://localhost/api/community-messenger/rooms/by-peer/calls", { method: "POST" });

beforeEach(() => {
  gates.session.mockResolvedValue({ ok: true });
  gates.signup.mockResolvedValue({ ok: true });
  gates.profile.mockResolvedValue({ ok: true });
  gates.rate.mockResolvedValue({ ok: true });
  gates.ensure.mockResolvedValue({ ok: true, roomId: "room-1" });
});

describe("ensurePeerDirectRoomForCall (F1)", () => {
  it("성공 → roomId", async () => {
    expect(await ensurePeerDirectRoomForCall(req, "u1", "peer")).toEqual({ ok: true, roomId: "room-1" });
  });

  it("세션·가입·프로필·방 생성 속도 제한 실패 → 같은 상태 코드 + roomError, 헤더 유지", async () => {
    const cases: Array<[keyof typeof gates, number]> = [
      ["session", 401],
      ["signup", 403],
      ["profile", 409],
      ["rate", 429],
    ];
    for (const [gate, status] of cases) {
      gates[gate].mockResolvedValueOnce({
        ok: false,
        response: NextResponse.json(
          { ok: false, error: `${gate}_failed` },
          { status, headers: { "Retry-After": "30" } },
        ),
      });
      const r = await ensurePeerDirectRoomForCall(req, "u1", "peer");
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.response.status).toBe(status);
      expect(r.response.headers.get("Retry-After")).toBe("30");
      expect(await r.response.json()).toMatchObject({ error: `${gate}_failed`, roomError: true });
    }
  });

  it("방 확보 함수 실패 → /rooms 와 같은 상태(403/400) + roomError", async () => {
    gates.ensure.mockResolvedValueOnce({ ok: false, error: "cannot_start_chat" });
    const r = await ensurePeerDirectRoomForCall(req, "u1", "peer");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
    expect(await r.response.json()).toMatchObject({ error: "cannot_start_chat", roomError: true });
  });
});
