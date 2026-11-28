import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 모임 R5 U — 사용자·운영 관리 라우트 동작 (설계 docs/audit/moim-r5-design-2026-11-28/BC-user-manage.md · INTEGRATED §B·§C).
 * B5 초대 거절 관문 · B11 답 1,000자 · B1 내 글 · B21 채팅 음소거 · C2 초대 확인 · C4 순서 저장 · C5 위임 취소 · C18 주소 불일치
 * · C19 링크 다시 쓰기 · E9 같은 역할 · E10 가입 신청자 내보내기 · E16 모임장 변경 알림 · B6 비로그인 401.
 */

type Row = Record<string, unknown> | null;

const h = vi.hoisted(() => {
  /** 표 이름 → 돌려줄 결과 (maybeSingle·await 모두) */
  const tables: Record<string, { data: unknown; error: unknown }> = {};
  const fromCalls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  function builder(table: string) {
    const rec = { table, ops: [] as Array<[string, unknown[]]> };
    fromCalls.push(rec);
    const result = () => tables[table] ?? { data: null, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "or", "order", "limit", "neq", "gt"]) {
      b[m] = (...a: unknown[]) => {
        rec.ops.push([m, a]);
        return b;
      };
    }
    b.maybeSingle = async () => result();
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return b;
  }
  const sb = { from: (t: string) => builder(t) };
  const guardWriteOpts: Array<Record<string, unknown>> = [];
  const g = { ok: true as const, userId: "u-me" as string | null, sb: sb as unknown };
  const rpc = {
    moimInviteRespond: vi.fn(async () => ({ ok: true, status: "declined" })),
    moimJoin: vi.fn(async () => ({ ok: true, status: "active" })),
    moimHostTransferCancel: vi.fn(async () => ({ ok: true, transfer_id: "t", moim_id: "m", to_user_id: "x" })),
    moimHostTransferRespond: vi.fn(async () => ({ ok: true, accepted: true, moim_id: "11111111-1111-4111-8111-111111111111" })),
    moimBoardReorder: vi.fn(async () => ({ ok: true })),
    moimBoardUpsert: vi.fn(async () => ({ ok: true })),
    moimJoinDecide: vi.fn(async () => ({ ok: true, moim_id: "11111111-1111-4111-8111-111111111111", user_id: "u-x" })),
    moimInviteLinkCreate: vi.fn(async () => ({ ok: true, invite_id: "new", token: "newtoken" })),
    moimMemberRoleSet: vi.fn(async () => ({ ok: true })),
    moimMemberNoteSet: vi.fn(async () => ({ ok: true })),
    moimMemberRemove: vi.fn(async () => ({ ok: true })),
    moimNotificationPrefsSet: vi.fn(async () => ({ ok: true })),
  };
  const q = {
    loadMoimAccess: vi.fn(async () => ({ moim: { id: "m1", main_room_id: "room-1" }, me: null, role: "member", overrides: {} }) as unknown),
    moimCanMap: vi.fn(() => ({ send_invite: true, manage_invite_link: true }) as Record<string, boolean>),
    checkMoimInviteCandidates: vi.fn(async () => ({ members: ["a"], unavailable: ["b"] })),
    listMyMoimContent: vi.fn(async () => ({ items: [], nextBefore: null })),
    listActiveMoimMemberIds: vi.fn(async () => ["u-me", "u-2"]),
  };
  const notify = {
    notifyMoimMany: vi.fn(async () => ({ failed: 0 })),
    notifyMoimHostChanged: vi.fn(async () => {}),
  };
  const gates = {
    requireSignupCompleteForUser: vi.fn(async () => ({ ok: true }) as { ok: true } | { ok: false; response: Response }),
    requireRegistrationForAction: vi.fn(async () => null as Response | null),
    guardMoimAcceptGate: vi.fn(async () => null as Response | null),
  };
  const after: Promise<unknown>[] = [];
  return { tables, fromCalls, sb, g, guardWriteOpts, rpc, q, notify, gates, after };
});

vi.mock("@/lib/moim/server/moim-route-guard.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-route-guard.server")>("@/lib/moim/server/moim-route-guard.server");
  return {
    ...actual,
    guardMoimWrite: async (_req: unknown, opts: Record<string, unknown>) => {
      h.guardWriteOpts.push(opts);
      return h.g;
    },
    guardMoimRead: async () => (h.g.userId ? h.g : { ok: false, response: new Response(JSON.stringify({ ok: false, error: "auth_required" }), { status: 401 }) }),
    guardMoimAcceptGate: (...a: unknown[]) => h.gates.guardMoimAcceptGate(...(a as [])),
  };
});
vi.mock("@/lib/moim/server/moim-rpc.server", () =>
  Object.fromEntries(Object.entries(h.rpc).map(([k, fn]) => [k, (...a: unknown[]) => (fn as (...x: unknown[]) => unknown)(...a)]))
);
vi.mock("@/lib/moim/server/moim-queries.server", () => ({
  loadMoimName: async () => "Moim",
  loadMoimAccess: (...a: unknown[]) => h.q.loadMoimAccess(...(a as [])),
  moimCanMap: (...a: unknown[]) => h.q.moimCanMap(...(a as [])),
  checkMoimInviteCandidates: (...a: unknown[]) => h.q.checkMoimInviteCandidates(...(a as [])),
  listMyMoimContent: (...a: unknown[]) => h.q.listMyMoimContent(...(a as [])),
  listActiveMoimMemberIds: (...a: unknown[]) => h.q.listActiveMoimMemberIds(...(a as [])),
  listMoimInviteLinks: async () => [],
  MOIM_INVITE_CHECK_MAX: 300,
}));
vi.mock("@/lib/moim/server/moim-schedule-queries.server", () => ({
  getMoimNotificationPrefs: async () => ({ notice: true, posts: false, schedules: true }),
}));
vi.mock("@/lib/moim/server/moim-notify.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-notify.server")>("@/lib/moim/server/moim-notify.server");
  return {
    ...actual,
    notifyMoimAfterResponse: (work: () => Promise<unknown>) => h.after.push(work()),
    notifyMoimMany: (...a: unknown[]) => h.notify.notifyMoimMany(...(a as [])),
    notifyMoimHostChanged: (...a: unknown[]) => h.notify.notifyMoimHostChanged(...(a as [])),
    notifyMoimJoinRequested: async () => {},
    notifyMoimMemberJoined: async () => {},
  };
});
vi.mock("@/lib/auth/require-signup-complete-api", () => ({ requireSignupCompleteForUser: (...a: unknown[]) => h.gates.requireSignupCompleteForUser(...(a as [])) }));
vi.mock("@/lib/auth/require-registration-for-action.server", () => ({
  requireRegistrationForAction: (...a: unknown[]) => h.gates.requireRegistrationForAction(...(a as [])),
}));

import { POST as inviteRespond } from "@/app/api/moim/invites/[inviteId]/route";
import { POST as joinPost } from "@/app/api/moim/[moimId]/join/route";
import { DELETE as transferCancel, POST as transferRespond } from "@/app/api/moim/host-transfers/[transferId]/route";
import { PUT as boardsPut } from "@/app/api/moim/[moimId]/boards/route";
import { POST as joinDecide } from "@/app/api/moim/[moimId]/join-requests/[requestId]/route";
import { POST as inviteLinkPost } from "@/app/api/moim/[moimId]/invite-links/route";
import { PATCH as memberPatch } from "@/app/api/moim/[moimId]/members/[userId]/route";
import { POST as memberRemove } from "@/app/api/moim/[moimId]/members/[userId]/remove/route";
import { GET as prefsGet } from "@/app/api/moim/[moimId]/notification-prefs/route";
import { POST as inviteCheck } from "@/app/api/moim/[moimId]/invites/check/route";
import { GET as myContentGet } from "@/app/api/moim/my-content/route";
import { resolveMemberConsentClassForApiMutation } from "@/lib/auth/member-consent-mutation-policy";

const MOIM = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";

const req = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`https://x.test${url}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const flush = async () => {
  await Promise.all(h.after.splice(0));
};

beforeEach(() => {
  vi.clearAllMocks();
  h.guardWriteOpts.length = 0;
  h.fromCalls.length = 0;
  h.after.length = 0;
  for (const k of Object.keys(h.tables)) delete h.tables[k];
  h.g.userId = "u-me";
});

describe("B5 초대 거절 — 휴대폰·약관 없이", () => {
  it("거절: 관문에 휴대폰을 요구하지 않고 동의 예외 · 약관·가입·수락 관문을 부르지 않는다", async () => {
    const res = await inviteRespond(req(`/api/moim/invites/${ID2}`, { accept: false }), { params: Promise.resolve({ inviteId: ID2 }) });
    expect(res.status).toBe(200);
    expect(h.guardWriteOpts[0]).toMatchObject({ consentExempt: true });
    expect(h.guardWriteOpts[0].phone).toBeUndefined();
    expect(h.gates.requireSignupCompleteForUser).not.toHaveBeenCalled();
    expect(h.gates.guardMoimAcceptGate).not.toHaveBeenCalled();
    expect(h.rpc.moimInviteRespond).toHaveBeenCalled();
  });

  it("수락: 약관 → 가입 → 이용 제한·휴대폰 순으로 확인 · 약관 미동의면 RPC 를 부르지 않는다", async () => {
    h.gates.requireSignupCompleteForUser.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    const res = await inviteRespond(req(`/api/moim/invites/${ID2}`, { accept: true }), { params: Promise.resolve({ inviteId: ID2 }) });
    expect(res.status).toBe(403);
    expect(h.rpc.moimInviteRespond).not.toHaveBeenCalled();
    await inviteRespond(req(`/api/moim/invites/${ID2}`, { accept: true }), { params: Promise.resolve({ inviteId: ID2 }) });
    expect(h.gates.requireRegistrationForAction).toHaveBeenCalled();
    expect(h.gates.guardMoimAcceptGate).toHaveBeenCalled();
  });

  it("중앙 동의 관문에서도 이 경로는 예외(거절이 라우트까지 닿음)", () => {
    expect(resolveMemberConsentClassForApiMutation("POST", `/api/moim/invites/${ID2}`)).toBe("CONSENT_EXEMPT");
    expect(resolveMemberConsentClassForApiMutation("DELETE", `/api/moim/host-transfers/${ID2}`)).toBe("CONSENT_EXEMPT");
  });
});

describe("B11 가입 답 1,000자 — 자르지 않고 400", () => {
  it("초대 수락·가입 버튼 둘 다 1,001자면 moim_join_answer_too_long 이고 RPC 를 부르지 않는다", async () => {
    const long = "가".repeat(1001);
    const a = await inviteRespond(req(`/api/moim/invites/${ID2}`, { accept: true, answers: [long] }), { params: Promise.resolve({ inviteId: ID2 }) });
    expect(a.status).toBe(400);
    expect(await a.json()).toMatchObject({ error: "moim_join_answer_too_long" });
    const b = await joinPost(req(`/api/moim/${MOIM}/join`, { answers: [long] }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(b.status).toBe(400);
    expect(h.rpc.moimInviteRespond).not.toHaveBeenCalled();
    expect(h.rpc.moimJoin).not.toHaveBeenCalled();
  });
  it("1,000자는 그대로 넘긴다", async () => {
    const ok = "a".repeat(1000);
    await joinPost(req(`/api/moim/${MOIM}/join`, { answers: [ok] }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(h.rpc.moimJoin).toHaveBeenCalledWith("u-me", MOIM, expect.objectContaining({ answers: [ok] }), h.sb);
  });
});

describe("C5 위임 요청 취소 · E16 모임장 변경 알림", () => {
  it("DELETE 는 moim_host_transfer_cancel(나, 요청 id) · 동의 예외 · 없음 → 404", async () => {
    await transferCancel(req(`/api/moim/host-transfers/${ID2}`, undefined, "DELETE"), { params: Promise.resolve({ transferId: ID2 }) });
    expect(h.rpc.moimHostTransferCancel).toHaveBeenCalledWith("u-me", ID2, h.sb);
    expect(h.guardWriteOpts[0]).toMatchObject({ consentExempt: true, writeKind: "none" });
    h.rpc.moimHostTransferCancel.mockResolvedValueOnce({ ok: false, error: "moim_transfer_not_found" } as never);
    const res = await transferCancel(req(`/api/moim/host-transfers/${ID2}`, undefined, "DELETE"), { params: Promise.resolve({ transferId: ID2 }) });
    expect(res.status).toBe(404);
  });

  it("수락 뒤 알림은 공용 notifyMoimHostChanged 하나(수락한 사람 = 새 모임장, 받지 않음)", async () => {
    await transferRespond(req(`/api/moim/host-transfers/${ID2}`, { accept: true }), { params: Promise.resolve({ transferId: ID2 }) });
    await flush();
    expect(h.notify.notifyMoimHostChanged).toHaveBeenCalledWith(h.sb, MOIM, "u-me", ["u-me", "u-2"], ID2, { actorId: "u-me" });
    expect(h.notify.notifyMoimMany).not.toHaveBeenCalled();
  });
});

describe("C4 게시판 순서 저장", () => {
  it("PUT { order } → moim_board_reorder(나, 모임, id 순서)", async () => {
    await boardsPut(req(`/api/moim/${MOIM}/boards`, { order: [ID2, ID3] }, "PUT"), { params: Promise.resolve({ moimId: MOIM }) });
    expect(h.rpc.moimBoardReorder).toHaveBeenCalledWith("u-me", MOIM, [ID2, ID3], h.sb);
  });
  it("빈 배열·uuid 아님 → 400, RPC 없음 · 집합 불일치 → 400 moim_board_order_invalid", async () => {
    const a = await boardsPut(req(`/api/moim/${MOIM}/boards`, { order: [] }, "PUT"), { params: Promise.resolve({ moimId: MOIM }) });
    const b = await boardsPut(req(`/api/moim/${MOIM}/boards`, { order: ["x"] }, "PUT"), { params: Promise.resolve({ moimId: MOIM }) });
    expect([a.status, b.status]).toEqual([400, 400]);
    expect(h.rpc.moimBoardReorder).not.toHaveBeenCalled();
    h.rpc.moimBoardReorder.mockResolvedValueOnce({ ok: false, error: "moim_board_order_invalid" } as never);
    const c = await boardsPut(req(`/api/moim/${MOIM}/boards`, { order: [ID2] }, "PUT"), { params: Promise.resolve({ moimId: MOIM }) });
    expect(c.status).toBe(400);
    expect(await c.json()).toMatchObject({ error: "moim_board_order_invalid" });
  });
});

describe("C18 가입 신청 결정 — 주소의 모임과 다르면 실행하지 않는다", () => {
  it("다른 모임의 신청 → 404, RPC 미호출", async () => {
    h.tables.moim_join_requests = { data: { moim_id: ID3 } as Row, error: null };
    const res = await joinDecide(req(`/api/moim/${MOIM}/join-requests/${ID2}`, { approve: true }), { params: Promise.resolve({ moimId: MOIM, requestId: ID2 }) });
    expect(res.status).toBe(404);
    expect(h.rpc.moimJoinDecide).not.toHaveBeenCalled();
  });
  it("같은 모임이면 결정한다", async () => {
    h.tables.moim_join_requests = { data: { moim_id: MOIM } as Row, error: null };
    await joinDecide(req(`/api/moim/${MOIM}/join-requests/${ID2}`, { approve: true }), { params: Promise.resolve({ moimId: MOIM, requestId: ID2 }) });
    expect(h.rpc.moimJoinDecide).toHaveBeenCalled();
  });
});

describe("C19 머리글 공유 — 쓸 수 있는 내 링크를 다시 쓴다", () => {
  it("reuse 이고 링크가 있으면 새로 만들지 않고 그 토큰 · 만료 하한 = 지금+24시간", async () => {
    h.tables.moim_invites = { data: { id: "old", token: "oldtoken" } as Row, error: null };
    const before = Date.now();
    const res = await inviteLinkPost(req(`/api/moim/${MOIM}/invite-links`, { expiresAt: null, reuse: true }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(await res.json()).toEqual({ ok: true, invite_id: "old", token: "oldtoken", reused: true });
    expect(h.rpc.moimInviteLinkCreate).not.toHaveBeenCalled();
    const ops = h.fromCalls.find((c) => c.table === "moim_invites")!.ops;
    expect(ops).toContainEqual(["eq", ["created_by", "u-me"]]);
    const orArg = String(ops.find(([m]) => m === "or")![1][0]);
    const min = Date.parse(orArg.split("expires_at.gt.")[1]!);
    expect(min - before).toBeGreaterThanOrEqual(24 * 3600 * 1000 - 1000);
  });
  it("다시 쓸 링크가 없으면 새로 만든다 · reuse 없으면 늘 새로", async () => {
    h.tables.moim_invites = { data: null, error: null };
    await inviteLinkPost(req(`/api/moim/${MOIM}/invite-links`, { expiresAt: null, reuse: true }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(h.rpc.moimInviteLinkCreate).toHaveBeenCalledTimes(1);
    h.tables.moim_invites = { data: { id: "old", token: "oldtoken" } as Row, error: null };
    await inviteLinkPost(req(`/api/moim/${MOIM}/invite-links`, { expiresAt: null }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(h.rpc.moimInviteLinkCreate).toHaveBeenCalledTimes(2);
  });
  it("reuse 라도 링크 권한이 없으면 403", async () => {
    h.q.moimCanMap.mockReturnValueOnce({ manage_invite_link: false });
    const res = await inviteLinkPost(req(`/api/moim/${MOIM}/invite-links`, { reuse: true }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(res.status).toBe(403);
  });
});

describe("E9 같은 역할 · E10 가입 신청자 내보내기", () => {
  it("changed=false 면 역할 알림을 보내지 않는다 · 키가 없으면(옛 DB) 보낸다", async () => {
    h.rpc.moimMemberRoleSet.mockResolvedValueOnce({ ok: true, changed: false } as never);
    await memberPatch(req(`/api/moim/${MOIM}/members/${ID2}`, { role: "staff" }, "PATCH"), { params: Promise.resolve({ moimId: MOIM, userId: ID2 }) });
    await flush();
    expect(h.notify.notifyMoimMany).not.toHaveBeenCalled();
    await memberPatch(req(`/api/moim/${MOIM}/members/${ID2}`, { role: "staff" }, "PATCH"), { params: Promise.resolve({ moimId: MOIM, userId: ID2 }) });
    await flush();
    expect(h.notify.notifyMoimMany).toHaveBeenCalledTimes(1);
  });

  it("was_pending → 「가입 신청이 거절됐어요」 · was_active → 「내보내졌어요」", async () => {
    h.rpc.moimMemberRemove.mockResolvedValueOnce({ ok: true, was_pending: true, moim_status: "active", retention_ended_at: null } as never);
    await memberRemove(req(`/api/moim/${MOIM}/members/${ID2}/remove`, { ban: true }), { params: Promise.resolve({ moimId: MOIM, userId: ID2 }) });
    await flush();
    expect(h.notify.notifyMoimMany).toHaveBeenLastCalledWith(h.sb, [ID2], expect.objectContaining({ kind: "moim_join_rejected", linkUrl: `/moim/${MOIM}` }));
    h.rpc.moimMemberRemove.mockResolvedValueOnce({ ok: true, was_active: true } as never);
    await memberRemove(req(`/api/moim/${MOIM}/members/${ID2}/remove`, { ban: false }), { params: Promise.resolve({ moimId: MOIM, userId: ID2 }) });
    await flush();
    expect(h.notify.notifyMoimMany).toHaveBeenLastCalledWith(h.sb, [ID2], expect.objectContaining({ kind: "moim_member_removed" }));
  });

  it("종료 모임에서 내보내면 이동 위치 = 모임 탭(받는 사람이 열 수 없음)", async () => {
    h.rpc.moimMemberRemove.mockResolvedValueOnce({ ok: true, was_active: true, moim_status: "closed", retention_ended_at: null } as never);
    await memberRemove(req(`/api/moim/${MOIM}/members/${ID2}/remove`, { ban: false }), { params: Promise.resolve({ moimId: MOIM, userId: ID2 }) });
    await flush();
    expect(h.notify.notifyMoimMany).toHaveBeenLastCalledWith(h.sb, [ID2], expect.objectContaining({ linkUrl: "/moim" }));
  });
});

describe("B21 채팅 알림 상태 · C2 초대 확인 · B1 내 글", () => {
  it("알림 설정 응답에 chatMuted = 대표 방의 내 음소거", async () => {
    h.tables.community_messenger_participants = { data: { is_muted: true } as Row, error: null };
    const res = await prefsGet(req(`/api/moim/${MOIM}/notification-prefs`, undefined, "GET"), { params: Promise.resolve({ moimId: MOIM }) });
    expect((await res.json()).prefs).toEqual({ notice: true, posts: false, schedules: true, chatMuted: true });
    const ops = h.fromCalls.find((c) => c.table === "community_messenger_participants")!.ops;
    expect(ops).toContainEqual(["eq", ["room_id", "room-1"]]);
    expect(ops).toContainEqual(["eq", ["user_id", "u-me"]]);
  });
  it("음소거를 읽지 못하면 null", async () => {
    h.tables.community_messenger_participants = { data: null, error: { message: "x" } };
    const res = await prefsGet(req(`/api/moim/${MOIM}/notification-prefs`, undefined, "GET"), { params: Promise.resolve({ moimId: MOIM }) });
    expect((await res.json()).prefs.chatMuted).toBeNull();
  });

  it("초대 확인: send_invite 없으면 403 · 300 초과 400 · 맞으면 members·unavailable", async () => {
    h.q.moimCanMap.mockReturnValueOnce({ send_invite: false });
    const a = await inviteCheck(req(`/api/moim/${MOIM}/invites/check`, { userIds: [ID2] }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(a.status).toBe(403);
    const b = await inviteCheck(req(`/api/moim/${MOIM}/invites/check`, { userIds: Array.from({ length: 301 }, () => ID2) }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(b.status).toBe(400);
    const c = await inviteCheck(req(`/api/moim/${MOIM}/invites/check`, { userIds: [ID2, "bad"] }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(await c.json()).toEqual({ ok: true, members: ["a"], unavailable: ["b"] });
    expect(h.q.checkMoimInviteCandidates).toHaveBeenCalledWith(h.sb, MOIM, [ID2]);
  });

  it("내 글: 비로그인 401 · type 이 틀리면 400 · 맞으면 나·종류·모임·커서를 넘긴다", async () => {
    h.g.userId = null;
    expect((await myContentGet(req("/api/moim/my-content?type=post", undefined, "GET"))).status).toBe(401);
    h.g.userId = "u-me";
    expect((await myContentGet(req("/api/moim/my-content?type=x", undefined, "GET"))).status).toBe(400);
    expect((await myContentGet(req("/api/moim/my-content?type=post&moim=bad", undefined, "GET"))).status).toBe(400);
    await myContentGet(req(`/api/moim/my-content?type=comment&moim=${MOIM}&before=cur`, undefined, "GET"));
    expect(h.q.listMyMoimContent).toHaveBeenCalledWith(h.sb, "u-me", { type: "comment", moimId: MOIM, before: "cur" });
  });
});

describe("B6 비로그인 — 초대 해석만 손님 허용 (구조 확인)", () => {
  it("구조 확인: guardMoimRead 의 allowGuest 는 app/api/moim/invite/[token] 하나만 · requireLogin 인자는 없다", () => {
    const token = readFileSync(join(process.cwd(), "app/api/moim/invite/[token]/route.ts"), "utf8");
    expect(token).toContain("allowGuest: true");
    for (const f of ["app/api/moim/route.ts", "app/api/moim/[moimId]/route.ts", "app/api/moim/posts/[postId]/route.ts", "app/api/moim/categories/route.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src).not.toContain("allowGuest");
      expect(src).not.toContain("requireLogin");
    }
  });
});
