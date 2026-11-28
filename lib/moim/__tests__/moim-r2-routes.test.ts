import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 R2 — 라우트·크론 동작 (설계 docs/audit/moim-r2-notifications-design-2026-11-28.md §3-3)
 * N-03 멤버로 내림 · N-08d was_active · P3 거절 사유 · R-e 응답 뒤 · N-01/N-08e 크론 보낸 뒤 표시.
 */

const { g, rpc, sent, notifyMoimMany, readPrefs, after } = vi.hoisted(() => {
/** R5 C18: 가입 신청 결정 라우트가 신청의 모임을 먼저 읽는다 — 주소의 모임(MOIM)과 같은 행을 돌려준다 */
const reqRowQuery = { select: () => reqRowQuery, eq: () => reqRowQuery, maybeSingle: async () => ({ data: { moim_id: "11111111-1111-4111-8111-111111111111" }, error: null }) };
const g = { ok: true as const, userId: "u-me", sb: { from: () => reqRowQuery } as unknown };
const rpc = {
  moimMemberRoleSet: vi.fn(),
  moimMemberNoteSet: vi.fn(),
  moimMemberRemove: vi.fn(),
  moimJoinDecide: vi.fn(),
  moimCronTick: vi.fn(),
  moimSchedulesAckReminders: vi.fn(async () => ({ ok: true, acked: 1 })),
  moimSchedulesAckReviews: vi.fn(async () => ({ ok: true, acked: 1 })),
  moimSchedulesClaimReminders: vi.fn(),
  moimSchedulesFinishDue: vi.fn(),
  moimSchedulesReviewsPending: vi.fn(),
  moimSanctionsExpireDue: vi.fn(),
  moimJoinRequestsExpireDue: vi.fn(),
  moimScheduleRoomsArchiveDue: vi.fn(),
  moimClosedRetentionDue: vi.fn(),
  moimAdminSanctionRevoke: vi.fn(),
  moimAdminDelete: vi.fn(),
  moimAdminRestore: vi.fn(),
};
const sent: Array<{ ids: string[]; input: Record<string, unknown> }> = [];
const notifyMoimMany = vi.fn(async (_sb: unknown, ids: string[], input: Record<string, unknown>) => {
  sent.push({ ids, input });
  return { failed: 0 };
});
const readPrefs = vi.fn<(...a: unknown[]) => Promise<string[] | null>>(async (_sb, _m, ids) => ids as string[]);
const after: Promise<unknown>[] = [];
return { g, rpc, sent, notifyMoimMany, readPrefs, after };
});

vi.mock("@/lib/moim/server/moim-route-guard.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-route-guard.server")>("@/lib/moim/server/moim-route-guard.server");
  return { ...actual, guardMoimWrite: async () => g };
});
vi.mock("@/lib/moim/server/moim-rpc.server", () => Object.fromEntries(Object.entries(rpc).map(([k, fn]) => [k, (...a: unknown[]) => (fn as (...x: unknown[]) => unknown)(...a)])));
vi.mock("@/lib/moim/server/moim-queries.server", () => ({ loadMoimName: async () => "Moim" }));
vi.mock("@/lib/moim/server/moim-notify.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-notify.server")>("@/lib/moim/server/moim-notify.server");
  return {
    ...actual,
    notifyMoimAfterResponse: (work: () => Promise<unknown>) => after.push(work()),
    notifyMoimMany: (...a: [unknown, string[], Record<string, unknown>]) => notifyMoimMany(...a),
    readMoimRecipientsByPref: (...a: unknown[]) => readPrefs(...a),
  };
});
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin", isSuperAdmin: true }, sb: {} }),
  requireSuperAdmin: async () => ({ ok: true, actor: { userId: "admin", isSuperAdmin: true }, sb: {} }),
}));
vi.mock("@/lib/security/cron-auth", () => ({ verifyCronRequestAuthorization: () => true }));
vi.mock("@/lib/security/cron-side-effect-gate", () => ({ rejectCronIfSideEffectsBlocked: () => null }));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));

import { PATCH as memberPatch } from "@/app/api/moim/[moimId]/members/[userId]/route";
import { POST as removePost } from "@/app/api/moim/[moimId]/members/[userId]/remove/route";
import { POST as decidePost } from "@/app/api/moim/[moimId]/join-requests/[requestId]/route";
import { GET as cronGet } from "@/app/api/cron/moim-schedules/route";
import { POST as revokePost } from "@/app/api/admin/moim/sanctions/[sanctionId]/route";
import { POST as lifecyclePost } from "@/app/api/admin/moim/moims/[moimId]/lifecycle/route";

const MOIM = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const REQ = "33333333-3333-4333-8333-333333333333";
const req = (body: unknown, method = "POST") =>
  new Request("https://x.test/api/moim", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
const flush = () => Promise.all(after.splice(0));

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  after.length = 0;
  process.env.CRON_SECRET = "s";
});

describe("N-03 역할 변경 알림", () => {
  it("멤버로 내려도 대상에게 보낸다 · 응답 뒤 · 역할은 문구 키(keyVars)", async () => {
    rpc.moimMemberRoleSet.mockResolvedValueOnce({ ok: true });
    await memberPatch(req({ role: "member" }, "PATCH"), { params: Promise.resolve({ moimId: MOIM, userId: USER }) });
    expect(after).toHaveLength(1); // notifyMoimAfterResponse 로 넘겼다(응답 뒤 발송)
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].ids).toEqual([USER]);
    expect(sent[0].input).toMatchObject({ kind: "moim_role_changed", keyVars: { role: "moim_role_member" } });
  });
});

describe("N-08d 내보내기·차단", () => {
  it("활동 멤버였으면 보낸다 (키 = 대상 + 밀리초)", async () => {
    rpc.moimMemberRemove.mockResolvedValueOnce({ ok: true, was_active: true });
    await removePost(req({ ban: false }), { params: Promise.resolve({ moimId: MOIM, userId: USER }) });
    await flush();
    expect(sent[0].input.kind).toBe("moim_member_removed");
    expect(String(sent[0].input.dedupeRef)).toMatch(new RegExp(`^${MOIM}:${USER}:\\d{13}$`));
  });
  it("비회원 차단(was_active=false)이면 「내보내졌어요」를 보내지 않는다", async () => {
    rpc.moimMemberRemove.mockResolvedValueOnce({ ok: true, was_active: false });
    await removePost(req({ ban: true }), { params: Promise.resolve({ moimId: MOIM, userId: USER }) });
    await flush();
    expect(sent).toHaveLength(0);
  });
});

describe("P3 가입 거절 사유", () => {
  it("사유가 있으면 갈래 with_reason + 사유(최대 100자)", async () => {
    rpc.moimJoinDecide.mockResolvedValueOnce({ ok: true, moim_id: MOIM, user_id: USER, approved: false });
    await decidePost(req({ approve: false, reason: "x".repeat(150) }), { params: Promise.resolve({ moimId: MOIM, requestId: REQ }) });
    await flush();
    expect(sent[0].input).toMatchObject({ kind: "moim_join_rejected", variant: "with_reason" });
    expect((sent[0].input.vars as Record<string, string>).reason).toHaveLength(100);
  });
  it("사유가 없으면 기본 문구, 승인은 사유 무시", async () => {
    rpc.moimJoinDecide.mockResolvedValueOnce({ ok: true, moim_id: MOIM, user_id: USER, approved: true });
    await decidePost(req({ approve: true, reason: "ok" }), { params: Promise.resolve({ moimId: MOIM, requestId: REQ }) });
    await flush();
    expect(sent[0].input.kind).toBe("moim_join_approved");
    expect(sent[0].input).not.toHaveProperty("variant");
  });
});

describe("N-01 · N-08e 크론 — 보낸 뒤 표시", () => {
  const tick = (over: Record<string, unknown>) => ({
    finish: { ok: true, done: [{ schedule_id: "old", moim_id: MOIM, title: "x", user_ids: ["ignored"] }] },
    reviews: { ok: true, reviews: [] },
    reminders24h: { ok: true, reminders: [] },
    reminders1h: { ok: true, reminders: [] },
    sanctions: { ok: true, refreshed: [] },
    joinRequests: { ok: true, expired: 0 },
    scheduleRooms: { ok: true, archived: 0 },
    closedRetention: { ok: true, ended: 0 },
    ...over,
  });
  const cron = () => cronGet(new Request("https://x.test/api/cron/moim-schedules", { headers: { authorization: "Bearer s" } }));

  it("0건이면 표시 호출이 없다", async () => {
    rpc.moimCronTick.mockResolvedValueOnce(tick({}));
    await cron();
    expect(rpc.moimSchedulesAckReminders).not.toHaveBeenCalled();
    expect(rpc.moimSchedulesAckReviews).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0); // finish.done 의 옛 user_ids 로는 보내지 않는다
  });

  it("리마인드: 키 = 일정:시작 시각, 24h 는 오늘/내일 갈래, 보낸 것만 표시", async () => {
    rpc.moimCronTick.mockResolvedValueOnce(
      tick({
        reminders24h: { ok: true, reminders: [{ schedule_id: "s1", moim_id: MOIM, title: "T", user_ids: ["a"], starts_at: "2099-01-01T10:00:00+00:00" }] },
      })
    );
    await cron();
    expect(sent[0].input).toMatchObject({ kind: "moim_schedule_reminder_24h", dedupeRef: "s1:2099-01-01T10:00:00+00:00" });
    expect(["today", "tomorrow"]).toContain(sent[0].input.variant);
    expect(rpc.moimSchedulesAckReminders).toHaveBeenCalledWith("24h", [{ schedule_id: "s1", starts_at: "2099-01-01T10:00:00+00:00" }], {});
  });

  it("설정을 못 읽은 일정은 보내지도 표시하지도 않는다(다음 회차에 다시)", async () => {
    readPrefs.mockResolvedValueOnce(null);
    rpc.moimCronTick.mockResolvedValueOnce(
      tick({ reminders1h: { ok: true, reminders: [{ schedule_id: "s2", moim_id: MOIM, title: "T", user_ids: ["a"], starts_at: "2099-01-01T10:00:00Z" }] } })
    );
    await cron();
    expect(sent).toHaveLength(0);
    expect(rpc.moimSchedulesAckReminders).not.toHaveBeenCalled();
  });

  it("후기: 보낼 후기 목록으로 보내고 그 일정만 표시", async () => {
    rpc.moimCronTick.mockResolvedValueOnce(tick({ reviews: { ok: true, reviews: [{ schedule_id: "s3", moim_id: MOIM, title: "T", user_ids: ["a", "b"] }] } }));
    await cron();
    expect(sent[0]).toMatchObject({ ids: ["a", "b"], input: { kind: "moim_schedule_review", dedupeRef: "s3" } });
    expect(rpc.moimSchedulesAckReviews).toHaveBeenCalledWith(["s3"], {});
  });
});

describe("재감사 F6 — 저장 실패가 있으면 표시하지 않는다", () => {
  it("리마인드 일부 실패 → ack 없음(다음 회차에 다시)", async () => {
    notifyMoimMany.mockImplementationOnce(async (_sb, ids, input) => {
      sent.push({ ids, input });
      return { failed: 1 };
    });
    rpc.moimCronTick.mockResolvedValueOnce({
      finish: { ok: true, done: [] },
      reviews: { ok: true, reviews: [] },
      reminders24h: { ok: true, reminders: [] },
      reminders1h: { ok: true, reminders: [{ schedule_id: "s9", moim_id: MOIM, title: "T", user_ids: ["a", "b"], starts_at: "2099-01-01T10:00:00Z" }] },
      sanctions: { ok: true, refreshed: [] },
      joinRequests: { ok: true, expired: 0 },
      scheduleRooms: { ok: true, archived: 0 },
      closedRetention: { ok: true, ended: 0 },
    });
    await cronGet(new Request("https://x.test/api/cron/moim-schedules", { headers: { authorization: "Bearer s" } }));
    expect(sent).toHaveLength(1);
    expect(rpc.moimSchedulesAckReminders).not.toHaveBeenCalled();
  });
});

describe("재감사 F4 — 제재 해제 알림은 그 단계가 실제로 풀렸을 때만", () => {
  const SID = "44444444-4444-4444-8444-444444444444";
  const call = () => revokePost(req({ reason: "reason ok" }), { params: Promise.resolve({ sanctionId: SID }) });
  it("경고 해제 → 상태 normal 이면 보낸다", async () => {
    rpc.moimAdminSanctionRevoke.mockResolvedValueOnce({ ok: true, moim_id: MOIM, level: "warn", platform_state: "normal", notify_user_ids: ["h"], name: "M" });
    await call();
    await flush();
    expect(sent[0].input).toMatchObject({ kind: "moim_sanction_released", variant: "warn" });
  });
  it("경고 해제했지만 다른 차단이 걸려 있으면(blocked) 보내지 않는다", async () => {
    rpc.moimAdminSanctionRevoke.mockResolvedValueOnce({ ok: true, moim_id: MOIM, level: "warn", platform_state: "blocked", notify_user_ids: ["h"], name: "M" });
    await call();
    await flush();
    expect(sent).toHaveLength(0);
  });
});

describe("재감사 F3 — 종료 상태로 복구되면 「다시 열렸어요」가 아니다", () => {
  it("closed 로 복구 → 갈래 closed", async () => {
    rpc.moimAdminRestore.mockResolvedValueOnce({ ok: true, status: "closed", name: "M", notify_user_ids: ["a"] });
    await lifecyclePost(req({ action: "restore", reason: "reason ok" }), { params: Promise.resolve({ moimId: MOIM }) });
    await flush();
    expect(sent[0].input).toMatchObject({ kind: "moim_restored", variant: "closed" });
  });
  it("active 로 복구 → 기본 문구", async () => {
    rpc.moimAdminRestore.mockResolvedValueOnce({ ok: true, status: "active", name: "M", notify_user_ids: ["a"] });
    await lifecyclePost(req({ action: "restore", reason: "reason ok" }), { params: Promise.resolve({ moimId: MOIM }) });
    await flush();
    expect(sent[0].input).not.toHaveProperty("variant");
  });
});
