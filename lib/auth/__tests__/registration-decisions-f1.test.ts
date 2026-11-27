/**
 * F1·결정 (Owner 2026-11-27 「승인, 구현 진행」) — 설계 `docs/audit/f1-registration-decisions-design-2026-11-27.md`.
 * - direct/start: 새 1:1 방만 가입 필요 (기존 방 다시 열기는 가입 없이)
 * - 모임장 넘기기: 수락만 가입 필요
 * - 입점 인증번호 발송: 새 입점 신청만 가입 필요, 발송 한도·문자 전에 거절
 * - 통화 경로(`POST /rooms`·통화용 방 확보)는 새 방 직전 확인을 넘기지 않는다 (정적)
 * - 화면 5곳: signup_incomplete 에 자기 오류를 겹쳐 띄우지 않는다 (정적)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  gap: null as null | { kind: "step"; step: "phone" | "address" } | { kind: "unavailable" },
  gate: null as unknown,
  existingRoom: false,
  createdRooms: 0,
  respond: vi.fn(),
  sendOtp: vi.fn(),
  rate: vi.fn(),
  ownStore: true,
}));

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
  requireAuthenticatedUserIdStrict: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));
vi.mock("@/lib/auth/require-signup-complete-api", () => ({ requireSignupCompleteForUser: async () => ({ ok: true }) }));
vi.mock("@/lib/profile/require-profile-completion.server", () => ({
  requireProfileFieldsForAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: h.ownStore ? { id: "s1" } : null, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/http/api-route", async (orig) => ({
  ...(await orig<typeof import("@/lib/http/api-route")>()),
  enforceRateLimit: async (...a: unknown[]) => {
    h.rate(...a);
    return { ok: true };
  },
}));
vi.mock("@/lib/auth/require-registration-for-action.server", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/require-registration-for-action.server")>();
  return {
    ...actual,
    resolveRegistrationGapForAction: async () => h.gap,
    requireRegistrationForAction: async () => h.gate,
  };
});
vi.mock("@/lib/community-messenger/service", () => ({
  startCommunityMessengerDirectChat: async (
    _uid: string,
    _input: unknown,
    opts?: { beforeCreate?: () => Promise<{ error: string } | null> },
  ) => {
    if (h.existingRoom) return { ok: true, roomId: "room-old", created: false };
    const denied = opts?.beforeCreate ? await opts.beforeCreate() : null;
    if (denied) return { ok: false, error: denied.error };
    h.createdRooms += 1;
    return { ok: true, roomId: "room-new", created: true };
  },
  getCommunityMessengerRoomSnapshot: async () => null,
}));
vi.mock("@/lib/moim/server/moim-route-guard.server", async (orig) => ({
  ...(await orig<typeof import("@/lib/moim/server/moim-route-guard.server")>()),
  guardMoimWrite: async () => ({ ok: true, userId: "u1", sb: {} }),
}));
vi.mock("@/lib/moim/server/moim-rpc.server", () => ({ moimHostTransferRespond: h.respond }));
vi.mock("@/lib/stores/store-phone-otp-service", () => ({
  STORE_PHONE_VERIFY_PURPOSES: ["store_apply", "store_phone_change"],
  sendStorePhoneOtp: h.sendOtp,
}));

import { POST as directStart } from "@/app/api/community-messenger/direct/start/route";
import { POST as hostTransferRespond } from "@/app/api/moim/host-transfers/[transferId]/route";
import { POST as storePhoneSend } from "@/app/api/me/store-phone-verification/send/route";

const json = (url: string, body: object) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) });
const DENY = () => NextResponse.json({ ok: false, code: "signup_incomplete", step: "address" }, { status: 403 });

beforeEach(() => {
  h.gap = null;
  h.gate = null;
  h.existingRoom = false;
  h.createdRooms = 0;
  h.ownStore = true;
  h.rate.mockReset();
  h.respond.mockReset().mockResolvedValue({ ok: true, accepted: false });
  h.sendOtp.mockReset().mockResolvedValue({ ok: true, data: { phone: "+639171234567", expiresAt: "x", resendAvailableAt: "y" } });
});

describe("F1 — 1:1 대화 시작", () => {
  it("가입 진행 중 + 새 방: 403 signup_incomplete+step, 방을 만들지 않음", async () => {
    h.gap = { kind: "step", step: "address" };
    const res = await directStart(json("/api/community-messenger/direct/start", { targetUserId: "u2" }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string; step?: string };
    expect(body).toMatchObject({ code: "signup_incomplete", step: "address" });
    expect(h.createdRooms).toBe(0);
  });
  it("가입 진행 중 + 기존 방: 200 (다시 열기는 가입 없이)", async () => {
    h.gap = { kind: "step", step: "phone" };
    h.existingRoom = true;
    const res = await directStart(json("/api/community-messenger/direct/start", { targetUserId: "u2" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { roomId?: string }).roomId).toBe("room-old");
  });
  it("가입 완료 + 새 방: 200 created", async () => {
    const res = await directStart(json("/api/community-messenger/direct/start", { targetUserId: "u2" }));
    expect(res.status).toBe(200);
    expect(h.createdRooms).toBe(1);
  });
  it("가입 판정 불가 + 새 방: 503 (통과시키지 않음)", async () => {
    h.gap = { kind: "unavailable" };
    const res = await directStart(json("/api/community-messenger/direct/start", { targetUserId: "u2" }));
    expect(res.status).toBe(503);
    expect(h.createdRooms).toBe(0);
  });
});

describe("결정 1 — 모임장 넘기기 응답", () => {
  const ctx = { params: Promise.resolve({ transferId: "11111111-1111-4111-8111-111111111111" }) };
  it("가입 진행 중: 수락 403 (처리 함수 미호출) · 거절은 처리", async () => {
    h.gate = DENY();
    const acc = await hostTransferRespond(json("/api/moim/host-transfers/x", { accept: true }), ctx);
    expect(acc.status).toBe(403);
    expect(h.respond).not.toHaveBeenCalled();
    h.gate = DENY();
    const rej = await hostTransferRespond(json("/api/moim/host-transfers/x", { accept: false }), ctx);
    expect(rej.status).not.toBe(403);
    expect(h.respond).toHaveBeenCalledTimes(1);
  });
});

describe("결정 4 — 입점 인증번호 발송", () => {
  it("가입 진행 중 + 새 입점 신청: 403 · 발송 한도·문자 미호출", async () => {
    h.gate = DENY();
    const res = await storePhoneSend(json("/api/me/store-phone-verification/send", { phone: "09171234567", purpose: "store_apply" }));
    expect(res.status).toBe(403);
    expect(h.rate).not.toHaveBeenCalled();
    expect(h.sendOtp).not.toHaveBeenCalled();
  });
  it("가입 진행 중 + 내 매장 번호 변경·보완 제출: 문자 발송까지 간다", async () => {
    for (const body of [
      { phone: "09171234567", purpose: "store_phone_change", storeId: "s1" },
      { phone: "09171234567", purpose: "store_apply", storeId: "s1" },
    ]) {
      h.gate = DENY();
      const res = await storePhoneSend(json("/api/me/store-phone-verification/send", body));
      expect(res.status, body.purpose).toBe(200);
    }
    expect(h.sendOtp).toHaveBeenCalledTimes(2);
  });
});

describe("정적 — 통화 경로 회귀 없음 · 화면 이중 안내 없음", () => {
  it("새 1:1 방 직전 확인은 direct/start 만 넘긴다 (POST /rooms·통화용 방 확보는 2인자 호출)", () => {
    const rooms = readFileSync("app/api/community-messenger/rooms/route.ts", "utf8");
    expect(rooms).toMatch(/ensureGeneralFriendDirectRoom\(auth\.userId, String\(body\.peerUserId \?\? ""\)\)/);
    const call = readFileSync("lib/community-messenger/server/ensure-peer-direct-room-for-call.ts", "utf8");
    expect(call).not.toContain("beforeCreate");
    const svc = readFileSync("lib/community-messenger/service.ts", "utf8");
    const fn = svc.slice(svc.indexOf("export async function ensureGeneralFriendDirectRoom("));
    const body = fn.slice(0, fn.indexOf("\nexport "));
    const existingReturn = body.indexOf("return { ok: true, roomId: existingId };");
    const gate = body.indexOf("opts.beforeCreate()");
    const insert = body.indexOf(".insert({");
    expect(existingReturn).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(existingReturn);
    expect(insert).toBeGreaterThan(gate);
  });
  it("화면 5곳은 signup_incomplete 에 자기 오류를 띄우지 않는다", () => {
    const checks: Array<[string, string]> = [
      ["components/community-messenger/contacts/MessengerContactsMemberSheet.tsx", 'if (j.code === "signup_incomplete") return false;'],
      ["components/community-messenger/forward/MessengerForwardSheet.tsx", 'if (!r.ok && r.error === "signup_incomplete") return "not_allowed";'],
      ["components/moim/MoimDetailScreen.tsx", 'if (r.code === "signup_incomplete") return;'],
      ["components/moim/manage/MoimManageHostRequest.tsx", 'if (r.code === "signup_incomplete") return;'],
      ["components/business/apply/StorePhoneVerifySheet.tsx", 'if (json.code === "signup_incomplete") {'],
    ];
    for (const [f, needle] of checks) expect(readFileSync(f, "utf8"), f).toContain(needle);
  });
});
