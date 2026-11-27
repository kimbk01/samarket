import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 2번 묶음 — 라우트·서버 동작 시험 (2026-11-27 감사 B4·B5·B8·B10·B13).
 * DB 함수 쪽(B1·B6·B7·B8·B9·B10·B12·B13·D4·E5)은 로컬 Postgres 시나리오로 수정 전 실패 재현 → 수정 후 통과를 확인했다(PR 본문).
 */

const g = { ok: true as const, userId: "u-inviter", sb: null as unknown };

/** select/eq/in 체인 → await 시 tables[table] 를 돌려주는 가짜 Supabase */
function fakeSb(tables: Record<string, unknown[]>) {
  const calls: string[] = [];
  const sb = {
    calls,
    from(table: string) {
      calls.push(table);
      const result = { data: tables[table] ?? [], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "or", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
      return chain;
    },
  };
  return sb;
}

const isBlockedByOther = vi.fn(async () => false);
const moimInviteSend = vi.fn(async () => ({ ok: true as const, invite_target_id: "it-1" }));
const moimClose = vi.fn(async () => ({ ok: true as const }));
const moimAccountCleanup = vi.fn();
const notifyMoimMany = vi.fn(async () => undefined);

vi.mock("@/lib/moim/server/moim-route-guard.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-route-guard.server")>("@/lib/moim/server/moim-route-guard.server");
  return { ...actual, guardMoimWrite: async () => g };
});
vi.mock("@/lib/community-messenger/social-relations", () => ({ isBlockedByOther: (...a: unknown[]) => isBlockedByOther(...(a as [])) }));
vi.mock("@/lib/moim/server/moim-rpc.server", () => ({
  moimInviteSend: (...a: unknown[]) => moimInviteSend(...(a as [])),
  moimClose: (...a: unknown[]) => moimClose(...(a as [])),
  moimAccountCleanup: (...a: unknown[]) => moimAccountCleanup(...(a as [])),
}));
vi.mock("@/lib/moim/server/moim-notify.server", () => ({
  notifyMoimMany: (...a: unknown[]) => notifyMoimMany(...(a as [])),
  moimPaths: { invites: () => "/moim/invites", home: (id: string) => `/moim/${id}`, schedule: (m: string, s: string) => `/moim/${m}/schedules/${s}` },
}));
vi.mock("@/lib/moim/server/moim-queries.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-queries.server")>("@/lib/moim/server/moim-queries.server");
  return { ...actual, loadMoimName: async () => "Moim", listActiveMoimMemberIds: async () => ["u-host", "u-a", "u-b"] };
});

import { POST as invitePost } from "@/app/api/moim/[moimId]/invites/route";
import { POST as closePost } from "@/app/api/moim/[moimId]/close/route";
import { runMoimAccountCleanup } from "@/lib/moim/server/moim-account-cleanup.server";
import { joinRequestAnswerPairs } from "@/lib/moim/server/moim-queries.server";

const MOIM = "11111111-1111-4111-8111-111111111111";
const INVITEE = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown) =>
  new Request("https://x.test/api/moim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  g.userId = "u-inviter";
  g.sb = fakeSb({ moim_members: [{ nickname: "me" }] });
});

describe("B4 초대 — 나를 차단한 사람에게는 보낼 수 없다 (설계 P4)", () => {
  it("받는 사람이 나를 차단했으면 400 moim_invite_not_allowed · RPC·푸시 0회", async () => {
    isBlockedByOther.mockResolvedValueOnce(true);
    const res = await invitePost(req({ userId: INVITEE }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "moim_invite_not_allowed" });
    expect(isBlockedByOther).toHaveBeenCalledWith("u-inviter", INVITEE);
    expect(moimInviteSend).not.toHaveBeenCalled();
    expect(notifyMoimMany).not.toHaveBeenCalled();
  });

  it("차단이 없으면 이전처럼 초대·푸시", async () => {
    const res = await invitePost(req({ userId: INVITEE }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(res.status).toBe(200);
    expect(moimInviteSend).toHaveBeenCalledTimes(1);
    expect(notifyMoimMany).toHaveBeenCalledWith(expect.anything(), [INVITEE], expect.objectContaining({ kind: "moim_invited" }));
  });
});

describe("B13 모임 종료 — 취소된 일정의 확정·신청자에게 일정 취소 알림 (설계 P15·§7)", () => {
  it("종료 알림 + 일정마다 참여자에게 moim_schedule_cancelled (종료한 사람 제외)", async () => {
    g.userId = "u-host";
    g.sb = fakeSb({
      moim_schedules: [{ id: "s1", title: "Sat game" }, { id: "s2", title: "Empty" }],
      moim_schedule_participants: [
        { schedule_id: "s1", user_id: "u-host" },
        { schedule_id: "s1", user_id: "u-a" },
        { schedule_id: "s1", user_id: "u-b" },
      ],
    });
    const res = await closePost(req({ confirmName: "Moim" }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(res.status).toBe(200);
    const kinds = notifyMoimMany.mock.calls.map((c) => [(c as unknown[])[1], ((c as unknown[])[2] as { kind: string }).kind]);
    expect(kinds).toEqual([
      [["u-a", "u-b"], "moim_closed"],
      [["u-a", "u-b"], "moim_schedule_cancelled"],
    ]);
  });

  it("종료가 실패하면 알림 없음", async () => {
    g.sb = fakeSb({ moim_schedules: [{ id: "s1", title: "x" }], moim_schedule_participants: [{ schedule_id: "s1", user_id: "u-a" }] });
    moimClose.mockResolvedValueOnce({ ok: false, error: "moim_confirm_name_mismatch" } as never);
    const res = await closePost(req({ confirmName: "wrong" }), { params: Promise.resolve({ moimId: MOIM }) });
    expect(res.status).toBe(400);
    expect(notifyMoimMany).not.toHaveBeenCalled();
  });
});

describe("B8 탈퇴·영구 삭제 전 모임 정리", () => {
  it("새 모임장이 생긴 모임마다 전체 멤버에게 moim_host_changed", async () => {
    moimAccountCleanup.mockResolvedValueOnce({ ok: true, transferred: 1, closed: 1, left: 2, handovers: [{ moim_id: "m1", to_user_id: "u-a" }] });
    const sb = fakeSb({ moim_members: [{ nickname: "NewHost" }] });
    expect(await runMoimAccountCleanup(sb as never, "u-gone")).toEqual({ ok: true });
    expect(notifyMoimMany).toHaveBeenCalledTimes(1);
    expect(notifyMoimMany).toHaveBeenCalledWith(
      sb,
      ["u-host", "u-a", "u-b"],
      expect.objectContaining({ kind: "moim_host_changed", moimId: "m1", dedupeRef: "account_withdrawal:m1:u-gone", vars: { moim: "Moim", name: "NewHost" } })
    );
  });

  it("DB 정리가 실패하면 실패를 돌려준다 (회원 삭제 라우트가 멈춤)", async () => {
    moimAccountCleanup.mockResolvedValueOnce({ ok: false, error: "moim_unknown" });
    expect(await runMoimAccountCleanup(fakeSb({}) as never, "u-gone")).toEqual({ ok: false, error: "moim_unknown" });
    expect(notifyMoimMany).not.toHaveBeenCalled();
  });
});

describe("B10 가입 신청 답변 짝", () => {
  it("새 형식: 신청 시점 질문 문장과 짝 — 지금 질문이 바뀌어도 그대로", () => {
    const stored = [
      { question: "Q one?", answer: "A one" },
      { question: "Q two?", answer: "A two" },
    ];
    expect(joinRequestAnswerPairs(stored, ["Q two?"])).toEqual(stored);
  });

  it("예전 형식(답 문자열 배열): 지금 질문 순서로 맞춘다", () => {
    expect(joinRequestAnswerPairs(["A one", "A two"], ["Q one?", "Q two?"])).toEqual([
      { question: "Q one?", answer: "A one" },
      { question: "Q two?", answer: "A two" },
    ]);
  });
});
