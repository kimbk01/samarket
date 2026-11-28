import { beforeEach, describe, expect, it, vi } from "vitest";

/** 모임 3번 묶음 B2·B3 — 가입·초대 수락 라우트가 알림을 부르는지 (응답 뒤 발송) */

const g = { ok: true as const, userId: "u-me", sb: {} as unknown };
const moimJoin = vi.fn();
const moimInviteRespond = vi.fn();
const notifyMoimJoinRequested = vi.fn(async () => undefined);
const notifyMoimMemberJoined = vi.fn(async () => undefined);
const after: Promise<unknown>[] = [];

vi.mock("@/lib/moim/server/moim-route-guard.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-route-guard.server")>("@/lib/moim/server/moim-route-guard.server");
  return { ...actual, guardMoimWrite: async () => g, guardMoimAcceptGate: async () => null };
});
vi.mock("@/lib/auth/require-registration-for-action.server", () => ({ requireRegistrationForAction: async () => null }));
vi.mock("@/lib/moim/server/moim-rpc.server", () => ({
  moimJoin: (...a: unknown[]) => moimJoin(...(a as [])),
  moimJoinCancel: vi.fn(),
  moimInviteRespond: (...a: unknown[]) => moimInviteRespond(...(a as [])),
}));
vi.mock("@/lib/moim/server/moim-notify.server", () => ({
  notifyMoimAfterResponse: (work: () => Promise<unknown>) => after.push(work()),
  notifyMoimJoinRequested: (...a: unknown[]) => notifyMoimJoinRequested(...(a as [])),
  notifyMoimMemberJoined: (...a: unknown[]) => notifyMoimMemberJoined(...(a as [])),
}));

import { POST as joinPost } from "@/app/api/moim/[moimId]/join/route";
import { POST as invitePost } from "@/app/api/moim/invites/[inviteId]/route";

const MOIM = "11111111-1111-4111-8111-111111111111";
const INVITE = "33333333-3333-4333-8333-333333333333";
const req = (body: unknown) =>
  new Request("https://x.test/api/moim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
const flush = () => Promise.all(after.splice(0));

beforeEach(() => vi.clearAllMocks());

describe("가입 라우트", () => {
  it("B2 바로 가입 → 모임장에게 새 멤버 알림", async () => {
    moimJoin.mockResolvedValueOnce({ ok: true, status: "active", room_id: "r1" });
    const res = await joinPost(req({ nickname: "Kim" }), { params: Promise.resolve({ moimId: MOIM }) });
    await flush();
    expect(res.status).toBe(200);
    expect(notifyMoimMemberJoined).toHaveBeenCalledWith(g.sb, MOIM, "u-me", "Kim");
    expect(notifyMoimJoinRequested).not.toHaveBeenCalled();
  });

  it("승인제 → 승인권자에게 가입 신청 알림 (이전과 같음)", async () => {
    moimJoin.mockResolvedValueOnce({ ok: true, status: "pending", request_id: "req-1" });
    await joinPost(req({ nickname: "Kim" }), { params: Promise.resolve({ moimId: MOIM }) });
    await flush();
    expect(notifyMoimJoinRequested).toHaveBeenCalledWith(g.sb, MOIM, "req-1", "Kim");
    expect(notifyMoimMemberJoined).not.toHaveBeenCalled();
  });
});

describe("초대 수락 라우트", () => {
  it("B3 멤버 초대 수락 → 가입 신청이 생기면 승인권자에게 알림", async () => {
    moimInviteRespond.mockResolvedValueOnce({ ok: true, status: "pending", request_id: "req-9", moim_id: MOIM });
    await invitePost(req({ accept: true }), { params: Promise.resolve({ inviteId: INVITE }) });
    await flush();
    expect(notifyMoimJoinRequested).toHaveBeenCalledWith(g.sb, MOIM, "req-9", "");
  });

  it("운영진 초대 수락(바로 가입) → 모임장에게 새 멤버 알림", async () => {
    moimInviteRespond.mockResolvedValueOnce({ ok: true, status: "active", moim_id: MOIM });
    await invitePost(req({ accept: true }), { params: Promise.resolve({ inviteId: INVITE }) });
    await flush();
    expect(notifyMoimMemberJoined).toHaveBeenCalledWith(g.sb, MOIM, "u-me", "");
  });

  it("거절 → 알림 없음", async () => {
    moimInviteRespond.mockResolvedValueOnce({ ok: true, status: "declined" });
    await invitePost(req({ accept: false }), { params: Promise.resolve({ inviteId: INVITE }) });
    await flush();
    expect(notifyMoimJoinRequested).not.toHaveBeenCalled();
    expect(notifyMoimMemberJoined).not.toHaveBeenCalled();
  });
});
