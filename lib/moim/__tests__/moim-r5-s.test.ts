import { describe, expect, it, vi } from "vitest";

/**
 * 모임 R5 — 서버·공용 계약 동작 시험 (작업자 S · INTEGRATED.md §A-5·§B·§D-1).
 * DB 함수 쪽은 로컬 PG17 시나리오(docs/audit/moim-r5-local-verify-scenarios-2026-11-28.sql)로 적용 전·후를 비교했다.
 */

vi.mock("@/lib/auth/api-session", async () => {
  const actual = await vi.importActual<object>("@/lib/auth/api-session");
  return { ...actual, getOptionalAuthenticatedUserId: async () => sessionUser.id };
});
vi.mock("@/lib/http/api-route", async () => {
  const actual = await vi.importActual<object>("@/lib/http/api-route");
  return { ...actual, enforceRateLimit: async () => ({ ok: true }) };
});
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));

const sessionUser: { id: string | null } = { id: null };

import { moimViewable, moimViewStateFromRpc } from "@/lib/moim/moim-view-rule";
import { moimSearchTerm, normalizeMoimSearchQuery } from "@/lib/moim/moim-search-query";
import { MOIM_ERROR_CODES, MOIM_ROUTE_ERROR_CODES, moimErrorFromRpcError } from "@/lib/moim/moim-error-codes";
import { guardMoimRead, moimRpcStatus } from "@/lib/moim/server/moim-route-guard.server";
import { moimAdminReportReview, moimBoardReorder, moimHostTransferCancel, moimMemberRemove } from "@/lib/moim/server/moim-rpc.server";
import { listMoimBans, listMoimPosts, listReceivedMoimInvites, type MoimAccess } from "@/lib/moim/server/moim-queries.server";
import { getNotificationPreferencePolicy } from "@/lib/notifications/policy/notification-preference-policy-registry";
import { translate } from "@/lib/i18n/messages";

/** select/eq/in/neq 를 실제로 거르는 가짜 Supabase (await = 남은 행) */
function filterSb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "is", "or", "order", "limit", "lt", "gt", "gte"]) chain[m] = () => chain;
      chain.eq = (c: string, v: unknown) => ((rows = rows.filter((r) => !(c in r) || r[c] === v)), chain);
      chain.neq = (c: string, v: unknown) => ((rows = rows.filter((r) => !(c in r) || r[c] !== v)), chain);
      chain.in = (c: string, vs: unknown[]) => ((rows = rows.filter((r) => !(c in r) || vs.includes(r[c]))), chain);
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
      return chain;
    },
  };
}

const moimRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, intro: "", cover_image_url: null, category_id: "c1", topic_label: null, lgu_id: "1381300000", join_mode: "instant",
  capacity: null, age_min_birth_year: null, age_max_birth_year: null, host_user_id: "h", status: "active", platform_state: "normal",
  member_count: 1, last_activity_at: "2026-11-01T00:00:00Z", main_room_id: null, created_at: "", updated_at: "", retention_ended_at: null, ...extra,
});

const access = (role: "host" | "co_host" | "staff" | "member" | null): MoimAccess => ({
  moim: moimRow("m1") as never,
  me: role ? ({ moim_id: "m1", user_id: "me", role, status: "active" } as never) : null,
  role,
  overrides: {},
});

describe("E4 볼 수 있는가 — 단일 규칙 (moimViewable)", () => {
  it("삭제 = 아무도 · 종료 = 열람 중 활동 멤버만 · 활동 = 누구나", () => {
    const active = { status: "active" as const, retentionEndedAt: null };
    const closed = { status: "closed" as const, retentionEndedAt: null };
    const ended = { status: "closed" as const, retentionEndedAt: "2026-11-01T00:00:00Z" };
    const deleted = { status: "deleted" as const, retentionEndedAt: null };
    expect([moimViewable(active, false), moimViewable(active, true)]).toEqual([true, true]);
    expect([moimViewable(closed, false), moimViewable(closed, true)]).toEqual([false, true]);
    expect([moimViewable(ended, false), moimViewable(ended, true)]).toEqual([false, false]);
    expect([moimViewable(deleted, false), moimViewable(deleted, true)]).toEqual([false, false]);
  });
  it("RPC 반환 키 → 상태 (옛 DB 는 키가 없어 null)", () => {
    expect(moimViewStateFromRpc({ moim_status: "closed", retention_ended_at: null })).toEqual({ status: "closed", retentionEndedAt: null });
    expect(moimViewStateFromRpc({})).toBeNull();
  });
});

describe("E17 검색어 정리 — 글자·숫자·공백만", () => {
  it("PostgREST 예약 문자와 와일드카드가 빠진다", () => {
    expect(moimSearchTerm("a,b.c:d(e)f\"g\\h*i%j_k")).toBe("a b c d e f g h i j k");
    expect(moimSearchTerm("배드민턴 클럽!!")).toBe("배드민턴 클럽");
    expect(moimSearchTerm("ＡＢＣ")).toBe("ABC");
    expect(moimSearchTerm("x".repeat(60))).toHaveLength(40);
    expect(moimSearchTerm(null)).toBe("");
  });
  it("모임 안 검색도 같은 정리를 쓴다(2~40자)", () => {
    expect(normalizeMoimSearchQuery("a.")).toBeNull();
    expect(normalizeMoimSearchQuery("ab.cd")).toBe("ab cd");
  });
});

describe("E20 RPC 오류 → 코드 · HTTP 번호", () => {
  it("모임 코드가 있으면 그대로, 없으면 Postgres 오류 번호로", () => {
    expect(moimErrorFromRpcError({ message: "P0001: moim_closed", code: "P0001" })).toBe("moim_closed");
    expect(moimErrorFromRpcError({ message: "new row violates check constraint", code: "23514" })).toBe("moim_invalid_input");
    expect(moimErrorFromRpcError({ message: "invalid input syntax for type integer", code: "22P02" })).toBe("moim_invalid_input");
    expect(moimErrorFromRpcError({ message: "duplicate key", code: "23505" })).toBe("moim_duplicate");
    expect(moimErrorFromRpcError({ message: "deadlock", code: "40P01" })).toBe("moim_conflict");
    expect(moimErrorFromRpcError({ message: "boom", code: "XX000" })).toBe("moim_unknown");
  });
  it("어드민 차단 해제 시도 403 · 모르는 오류 500 · 중복 409", () => {
    expect(moimRpcStatus("moim_ban_admin_only")).toBe(403);
    expect(moimRpcStatus("moim_unknown")).toBe(500);
    expect(moimRpcStatus("moim_duplicate")).toBe(409);
    expect(moimRpcStatus("moim_schedule_request_not_found")).toBe(404);
    expect(moimRpcStatus("moim_closed")).toBe(400);
  });
  it("RPC 래퍼가 Postgres 오류 번호를 코드로 바꾼다", async () => {
    const sb = { rpc: vi.fn(async () => ({ data: null, error: { message: "check failed", code: "23514" } })) };
    expect(await moimMemberRemove("a", "m", "t", false, null, sb as never)).toEqual({ ok: false, error: "moim_invalid_input", detail: "check failed" });
  });
});

describe("새·바뀐 RPC 래퍼 인자", () => {
  it("검토 시작은 사유를 넘긴다 (D9) · 위임 취소는 요청 id (K-1) · 게시판 순서는 id 배열 (N7)", async () => {
    const sb = { rpc: vi.fn(async () => ({ data: { ok: true }, error: null })) };
    await moimAdminReportReview("adm", "rep", "looking", sb as never);
    await moimHostTransferCancel("u", "tr", sb as never);
    await moimBoardReorder("u", "m", ["b2", "b1"], sb as never);
    expect(sb.rpc.mock.calls).toEqual([
      ["moim_admin_report_review", { p_admin: "adm", p_report: "rep", p_reason: "looking" }],
      ["moim_host_transfer_cancel", { p_actor: "u", p_transfer: "tr" }],
      ["moim_board_reorder", { p_actor: "u", p_moim: "m", p_board_ids: ["b2", "b1"] }],
    ]);
  });
});

describe("B6 비로그인 읽기 막기 (guardMoimRead)", () => {
  const req = new Request("https://x.test/api/moim") as never;
  it("기본 = 로그인 필수 401 · allowGuest 는 통과", async () => {
    sessionUser.id = null;
    const denied = await guardMoimRead(req, { rateKey: "t" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(401);
    const guest = await guardMoimRead(req, { rateKey: "t", allowGuest: true });
    expect(guest).toMatchObject({ ok: true, userId: null });
    sessionUser.id = "u1";
    expect(await guardMoimRead(req, { rateKey: "t" })).toMatchObject({ ok: true, userId: "u1" });
  });
});

describe("E3 차단 목록 — 플랫폼 어드민 차단은 사유를 숨기고 표시", () => {
  it("source=admin → reason null · byPlatform true", async () => {
    const sb = filterSb({
      moim_bans: [
        { moim_id: "m1", user_id: "x", reason: "admin secret", created_at: "2", source: "admin" },
        { moim_id: "m1", user_id: "y", reason: "staff reason", created_at: "1", source: "moim" },
      ],
      moim_members: [],
    });
    const rows = await listMoimBans(sb as never, access("co_host"));
    expect(rows?.map((r) => [r.userId, r.reason, r.byPlatform])).toEqual([
      ["x", null, true],
      ["y", "staff reason", false],
    ]);
  });
});

describe("B14 받은 초대 — 수락할 수 있는 것만", () => {
  it("차단 모임 · 이미 멤버 · 차단된 초대는 빠진다", async () => {
    const sb = filterSb({
      moim_invite_targets: ["m1", "m2", "m3", "m4"].map((m, i) => ({ id: `i-${m}`, moim_id: m, inviter_id: "h", created_at: String(9 - i), invitee_user_id: "me", status: "sent" })),
      moims: [moimRow("m1"), moimRow("m2", { platform_state: "blocked" }), moimRow("m3"), moimRow("m4")],
      moim_members: [
        { moim_id: "m3", user_id: "me", role: "member", status: "active", nickname: "", avatar_url: null, bio: "", joined_at: null, rejoin_count: 0 },
        { moim_id: "m4", user_id: "me", role: "member", status: "banned", nickname: "", avatar_url: null, bio: "", joined_at: null, rejoin_count: 0 },
      ],
      moim_categories: [],
      moim_join_questions: [],
    });
    const out = await listReceivedMoimInvites(sb as never, "me");
    expect(out.map((x) => x.id)).toEqual(["i-m1"]);
  });
});

describe("B19 공개 글의 게시판 이름", () => {
  it("사용자 게시판 글은 boardName 을 채운다", async () => {
    const sb = filterSb({
      moim_posts: [{ id: "p1", moim_id: "m1", board_id: "b1", author_id: "a", title: "t", body: "b", images: [], visibility: "public", is_pinned: false, status: "active", comment_count: 0, created_at: "2026-11-01T00:00:00Z", updated_at: "" }],
      moim_boards: [{ id: "b1", kind: "custom", name: "Club" }],
      moim_members: [],
    });
    const r = await listMoimPosts(sb as never, access(null), null, {});
    expect(r.items.map((p) => [p.boardKind, p.boardName])).toEqual([["custom", "Club"]]);
  });
});

describe("E5·E6 알림 정책 — 끌 수 없음", () => {
  it("모임 신고 결과·어드민 정보 수정 = mandatory", () => {
    for (const kind of ["moim_report_result", "moim_admin_info_updated"]) {
      const p = getNotificationPreferencePolicy({ metaKind: kind, eventType: "community_activity", recipientRole: "member" } as never);
      expect(p.policyClass, kind).toBe("mandatory");
    }
  });
});

describe("오류 코드 계약 — 새 코드마다 ko·en 문구", () => {
  it("R5 새 코드(SQL 14 · 라우트 4)가 목록에 있고 문구가 있다", () => {
    const fresh = [
      "moim_ban_admin_only", "moim_content_author_deleted", "moim_image_url_invalid", "moim_age_range_invalid", "moim_region_invalid",
      "moim_schedule_request_not_found", "moim_policy_report_reason_none_active", "moim_closed", "moim_deleted", "moim_sanction_not_revocable",
      "moim_sanction_already_active", "moim_report_link_invalid", "moim_board_order_invalid", "moim_room_not_moim",
    ];
    const route = ["moim_invalid_input", "moim_join_answer_too_long", "moim_rooms_unavailable", "moim_room_managed_by_moim"];
    for (const c of fresh) expect(MOIM_ERROR_CODES as readonly string[], c).toContain(c);
    for (const c of route) expect(MOIM_ROUTE_ERROR_CODES as readonly string[], c).toContain(c);
    for (const c of [...fresh, ...route]) {
      const key = `moim_err_${c}` as Parameters<typeof translate>[1];
      const ko = translate("ko", key);
      const en = translate("en", key);
      expect(ko, c).not.toBe(key);
      expect(en, c).not.toBe(key);
      expect(en, c).not.toMatch(/[가-힣]/);
    }
  });
});
