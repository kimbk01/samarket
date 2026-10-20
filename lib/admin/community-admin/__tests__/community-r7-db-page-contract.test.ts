/**
 * R7 잔여 — 커뮤니티 묶음 고정 조회 상한 제거 계약 (가짜 DB).
 * 각 목록은 DB RPC 한 번으로 필터·정렬·페이지·정확한 total 을 받는다 — 후보 id 를 N건만 모아 in(...) 하거나
 * 최근 N건만 읽어 메모리에서 자르는 호출이 없어야 한다. 파라미터가 없을 때의 기존 경로(다른 호출자)는 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createFakeCommunitySupabase,
  type FakeCall,
  type FakeResult,
  type FakeRpcCall,
} from "./fake-community-supabase";

let handler: (call: FakeCall) => FakeResult = () => ({ data: [], error: null });
let rpcHandler: (call: FakeRpcCall) => FakeResult = () => ({ data: null, error: null });
const fake = createFakeCommunitySupabase(
  (c) => handler(c),
  (c) => rpcHandler(c)
);

vi.mock("@/lib/admin/community-admin/community-admin-guards", () => ({
  requireCommunityAdmin: async () => ({ ok: true, userId: "admin-1", actor: { userId: "admin-1" }, sb: fake.sb }),
}));
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => fake.sb,
}));
vi.mock("@/lib/admin-community/member-identity", () => ({
  loadAdminMemberIdentityMap: async () => new Map(),
  formatAdminMemberLabel: () => "회원",
  adminMemberHref: (id: string) => `/admin/members/${id}`,
}));

import { listCommunityReportGroupsForAdmin } from "@/lib/community-feed/admin-community-reports";
import { GET as pointsGET } from "@/app/api/admin/community/points/route";
import { GET as commentsGET } from "@/app/api/admin/community/engine/comments/route";
import { GET as meetingsGET } from "@/app/api/admin/community/engine/meetings/route";
import { GET as restrictionsGET } from "@/app/api/admin/community/restrictions/route";
import { handleAdminPointChargesListGet } from "@/lib/admin/shared-handlers/admin-point-charges-list";
import { loadAdminMeetingReports } from "@/lib/admin/community-admin/load-admin-meeting-reports";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";

const req = (path: string, params: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}?${new URLSearchParams(params).toString()}`);

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function onlyRpc(fn: string): FakeRpcCall {
  const hits = fake.rpcCalls.filter((c) => c.fn === fn);
  expect(hits).toHaveLength(1);
  return hits[0];
}

/** 고정 상한 흔적: 목록 테이블에 .limit(N≥100) 또는 후보 in(...) 이 없다 */
function noFixedCapOn(table: string) {
  for (const c of fake.calls.filter((x) => x.table === table)) {
    expect(c.limit === undefined || c.limit <= 1).toBe(true);
  }
}

beforeEach(() => {
  fake.calls.length = 0;
  fake.rpcCalls.length = 0;
  handler = () => ({ data: [], error: null });
  rpcHandler = () => ({ data: null, error: null });
});

describe("커뮤니티 신고 처리함 — listCommunityReportGroupsForAdmin (GROUP_SCAN_CAP 5000 제거)", () => {
  it("탭·필터·limit/offset → RPC 인자 · total/counts = RPC (5,000 초과) · 행 순서 = RPC 순서", async () => {
    rpcHandler = () => ({
      data: {
        total: 7321,
        tab_counts: { pending: 7321, reviewing: 12, resolved: 3, dismissed: 1, all: 7400 },
        rows: [
          { target_type: "comment", target_id: U2, primary_report_id: "r2", group_status: "open", report_count: 3, reporter_count: 2, open_count: 3, latest_reason: "spam", latest_at: "2026-10-02T00:00:00Z", first_at: "2026-10-01T00:00:00Z" },
          { target_type: "post", target_id: U1, primary_report_id: "r1", group_status: "reviewing", report_count: 1, reporter_count: 1, open_count: 1, latest_reason: null, latest_at: "2026-10-01T00:00:00Z", first_at: "2026-10-01T00:00:00Z" },
        ],
      },
      error: null,
    });
    handler = (c) =>
      c.table === "community_reports"
        ? {
            data: [
              { id: "r1", target_type: "post", target_id: U1, user_id: U3, reason: "x", status: "reviewing", created_at: "2026-10-01T00:00:00Z" },
              { id: "r2", target_type: "comment", target_id: U2, user_id: U3, reason: "spam", status: "open", created_at: "2026-10-02T00:00:00Z" },
            ],
            error: null,
          }
        : { data: [], error: null };
    const r = await listCommunityReportGroupsForAdmin({
      tab: "pending",
      targetType: "comment",
      q: "kim%_",
      topicSlug: "Free",
      reporterId: U3,
      authorId: U1,
      createdFromIso: "2026-09-30T16:00:00.000Z",
      createdToIso: "2026-10-07T16:00:00.000Z",
      limit: 20,
      offset: 40,
    });
    const call = onlyRpc("admin_community_report_groups_page");
    expect(call.args).toMatchObject({
      p_tab: "pending",
      p_target_type: "comment",
      p_q_pattern: "%kim%",
      p_topic_slug: "Free",
      p_reporter_id: U3,
      p_author_id: U1,
      p_from: "2026-09-30T16:00:00.000Z",
      p_to: "2026-10-07T16:00:00.000Z",
      p_limit: 20,
      p_offset: 40,
    });
    expect(call.args.p_tab_groups).toEqual({
      pending: ["open", "reviewing"],
      reviewing: ["reviewing"],
      resolved: ["resolved"],
      dismissed: ["dismissed"],
    });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(7321);
    expect(r.counts).toEqual({ pending: 7321, reviewing: 12, resolved: 3, dismissed: 1, all: 7400 });
    expect(r.truncated).toBe(false);
    expect(r.groups.map((g) => g.key)).toEqual([`comment:${U2}`, `post:${U1}`]);
    expect(r.groups[0]).toMatchObject({ primary_report_id: "r2", report_count: 3, reporter_count: 2, open_count: 3, group_status: "open" });
    // 대표 신고만 id 로 읽는다 — 최근 N건 스캔(.limit(5000)) 없음
    const reportReads = fake.calls.filter((c) => c.table === "community_reports");
    expect(reportReads).toHaveLength(1);
    expect(reportReads[0].filters).toContainEqual(["in", "id", ["r2", "r1"]]);
    noFixedCapOn("community_reports");
    // 카테고리·작성자·검색 후보 id 수집 쿼리 없음
    expect(fake.calls.some((c) => c.table === "profiles" && c.limit)).toBe(false);
    expect(fake.calls.some((c) => c.table === "community_posts" && c.filters.some(([k, col]) => k === "eq" && col === "topic_slug"))).toBe(false);
  });

  it("빈 페이지여도 total·counts 는 전체 기준 · RPC 오류 → ok=false", async () => {
    rpcHandler = () => ({ data: { total: 5, tab_counts: { pending: 5 }, rows: [] }, error: null });
    const r = await listCommunityReportGroupsForAdmin({ tab: "pending", limit: 1, offset: 0 });
    expect(r).toMatchObject({ ok: true, total: 5, groups: [], truncated: false });
    expect(r.counts.pending).toBe(5);
    expect(r.counts.all).toBe(0);
    rpcHandler = () => ({ data: null, error: { message: "boom" } });
    expect((await listCommunityReportGroupsForAdmin({ tab: "all" })).ok).toBe(false);
  });

  it("all 탭 = 상태 묶음 없음(p_tab 'all' 은 groups 에 없음) · UUID 아닌 회원 필터 = 빈 결과(RPC 미호출)", async () => {
    rpcHandler = () => ({ data: { total: 0, tab_counts: {}, rows: [] }, error: null });
    await listCommunityReportGroupsForAdmin({ tab: "all" });
    const call = onlyRpc("admin_community_report_groups_page");
    expect(call.args.p_tab).toBe("all");
    expect(Object.keys(call.args.p_tab_groups as object)).not.toContain("all");
    fake.rpcCalls.length = 0;
    const r = await listCommunityReportGroupsForAdmin({ tab: "pending", reporterId: "not-a-uuid" });
    expect(r).toMatchObject({ ok: true, total: 0 });
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe("GET /api/admin/community/points — 홍보 주문 id 500 · 합계 5,000행 상한 제거", () => {
  it("limit/offset·필터 → RPC · total·sums = RPC · 홍보 주문 id 수집·합계 전량 읽기 없음", async () => {
    rpcHandler = () => ({
      data: {
        total: 6012,
        sums: { count: 6012, amount_in: 90000, amount_out: -1234 },
        rows: [
          { id: "l1", user_id: U1, entry_type: "spend", amount: -10, balance_after: 5, related_type: "promotion_order", related_id: `hold:${U2}`, description: "", actor_type: "user", actor_id: null, created_at: "2026-10-01T00:00:00Z" },
        ],
      },
      error: null,
    });
    const res = await pointsGET(req("/api/admin/community/points", { userId: U1, entryType: "spend", period: "all", limit: "50", offset: "100" }));
    const j = await json(res);
    const call = onlyRpc("admin_point_ledger_domain_page");
    expect(call.args).toMatchObject({
      p_domain: "community",
      p_related_types: ["community_reward", "community_reclaim", "promotion_order", "admin_manual"],
      p_user_id: U1,
      p_entry_type: "spend",
      p_limit: 50,
      p_offset: 100,
    });
    expect(j.total).toBe(6012);
    expect(j.sums).toEqual({ count: 6012, amountIn: 90000, amountOut: -1234 });
    expect(j.promoOrderIdCapped).toBe(false);
    expect((j.rows as Array<{ id: string; relatedId: string }>)[0]).toMatchObject({ id: "l1", relatedId: `hold:${U2}` });
    expect(fake.calls.some((c) => c.table === "point_promotion_orders")).toBe(false);
    expect(fake.calls.some((c) => c.table === "point_ledger")).toBe(false);
  });

  it("type=promotion_order 하나만 → RPC 유형 목록도 하나 · RPC 오류 → 500", async () => {
    rpcHandler = () => ({ data: { total: 0, sums: { count: 0, amount_in: 0, amount_out: 0 }, rows: [] }, error: null });
    await pointsGET(req("/api/admin/community/points", { type: "promotion_order" }));
    expect(onlyRpc("admin_point_ledger_domain_page").args.p_related_types).toEqual(["promotion_order"]);
    rpcHandler = () => ({ data: null, error: { message: "boom" } });
    const res = await pointsGET(req("/api/admin/community/points", {}));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/admin/community/engine/comments — 주제 500 · 신고 500 · 닉네임 200 상한 제거", () => {
  it("주제·신고·종류·검색 → RPC 인자 · total = RPC · 행 순서 = RPC ids 순서 · 후보 in(...) 없음", async () => {
    rpcHandler = () => ({ data: { total: 1234, ids: ["c2", "c1"] }, error: null });
    handler = (c) =>
      c.table === "community_comments" && c.filters.some(([k, col]) => k === "in" && col === "id")
        ? {
            data: [
              { id: "c1", post_id: U1, parent_id: null, user_id: U3, content: "a", status: "active", created_at: "2026-10-01T00:00:00Z" },
              { id: "c2", post_id: U1, parent_id: "c1", user_id: U3, content: "b", status: "active", created_at: "2026-10-02T00:00:00Z" },
            ],
            error: null,
          }
        : { data: [], error: null };
    const res = await commentsGET(
      req("/api/admin/community/engine/comments", {
        topicSlug: "FREE",
        reported: "1",
        type: "reply",
        status: "active",
        q: "kim",
        createdFrom: "2026-10-01T00:00:00Z",
        limit: "100",
        offset: "200",
      })
    );
    const j = await json(res);
    expect(onlyRpc("admin_community_comments_page").args).toMatchObject({
      p_topic_slug: "free",
      p_reported_only: true,
      p_kind: "reply",
      p_status: "active",
      p_q_pattern: "%kim%",
      p_q_uuid: null,
      p_from: "2026-10-01T00:00:00Z",
      p_limit: 100,
      p_offset: 200,
    });
    expect(j.total).toBe(1234);
    expect(j.topicFilterTruncated).toBe(false);
    expect((j.comments as Array<{ id: string; kind: string }>).map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(fake.calls.some((c) => c.table === "community_posts" && c.filters.some(([, col]) => col === "topic_slug"))).toBe(false);
    expect(fake.calls.some((c) => c.table === "profiles")).toBe(false);
    expect(fake.calls.some((c) => c.table === "community_reports" && c.filters.some(([k, col]) => k === "in" && col === "status"))).toBe(false);
    noFixedCapOn("community_comments");
  });

  it("UUID 검색 → p_q_uuid · commentId → 단건 조회(RPC 없음)", async () => {
    rpcHandler = () => ({ data: { total: 0, ids: [] }, error: null });
    await commentsGET(req("/api/admin/community/engine/comments", { q: U2 }));
    expect(onlyRpc("admin_community_comments_page").args.p_q_uuid).toBe(U2);
    fake.rpcCalls.length = 0;
    await commentsGET(req("/api/admin/community/engine/comments", { commentId: "c9" }));
    expect(fake.rpcCalls).toHaveLength(0);
    const one = fake.calls.find((c) => c.table === "community_comments")!;
    expect(one.filters).toContainEqual(["eq", "id", "c9"]);
  });
});

describe("GET /api/admin/community/engine/meetings — 닉네임 후보 200 상한 제거", () => {
  it("탭·상태·검색 → RPC · total = RPC · 행 순서 = ids 순서 · 닉네임 후보 조회 없음", async () => {
    rpcHandler = () => ({ data: { total: 333, ids: ["m2", "m1"] }, error: null });
    handler = (c) =>
      c.table === "meetings"
        ? { data: [{ id: "m1", post_id: U1, host_user_id: U3, password_hash: "x" }, { id: "m2", post_id: U2, host_user_id: U3 }], error: null }
        : { data: [], error: null };
    const j = await json(await meetingsGET(req("/api/admin/community/engine/meetings", { tab: "open", q: "kim", limit: "50", offset: "50" })));
    expect(onlyRpc("admin_community_meetings_page").args).toMatchObject({
      p_tab: "open",
      p_status: null,
      p_q_pattern: "%kim%",
      p_q_uuid: null,
      p_limit: 50,
      p_offset: 50,
    });
    expect(j.total).toBe(333);
    const rows = j.meetings as Array<{ id: string; has_password: boolean; password_hash?: string }>;
    expect(rows.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(rows[1].has_password).toBe(true);
    expect(rows[1].password_hash).toBeUndefined();
    expect(fake.calls.some((c) => c.table === "profiles")).toBe(false);
  });

  it("meetingId → 단건(RPC 없음) · 기존 응답 모양", async () => {
    handler = (c) => (c.table === "meetings" ? { data: [{ id: U1, post_id: U2, host_user_id: U3 }], error: null, count: 1 } : { data: [], error: null });
    const j = await json(await meetingsGET(req("/api/admin/community/engine/meetings", { meetingId: U1 })));
    expect(fake.rpcCalls).toHaveLength(0);
    expect(j).toMatchObject({ ok: true, total: 1 });
  });
});

describe("GET /api/admin/community/restrictions — 닉네임 후보 200 상한 제거", () => {
  it("상태·종류·회원·닉네임 → RPC(scope community) · total = RPC · 행 순서 = ids 순서", async () => {
    rpcHandler = () => ({ data: { total: 250, ids: ["s2", "s1"] }, error: null });
    handler = (c) =>
      c.table === "sanctions"
        ? {
            data: [
              { id: "s1", user_id: U1, sanction_type: "warning", restriction: null, start_at: null, end_at: null, reason: null, created_by: null, created_at: "2026-10-01T00:00:00Z", revoked_at: null, revoked_by: null, revoke_reason: null, source_report_id: null, source_report_kind: null },
              { id: "s2", user_id: U2, sanction_type: "warning", restriction: null, start_at: null, end_at: null, reason: null, created_by: null, created_at: "2026-10-02T00:00:00Z", revoked_at: null, revoked_by: null, revoke_reason: null, source_report_id: null, source_report_kind: null },
            ],
            error: null,
          }
        : { data: [], error: null };
    const j = await json(
      await restrictionsGET(req("/api/admin/community/restrictions", { status: "all", kind: "warning", q: "kim_(", limit: "20", offset: "40" }))
    );
    expect(onlyRpc("admin_sanctions_page").args).toMatchObject({
      p_scope: "community",
      p_status: "all",
      p_kind: "warning",
      p_user_id: null,
      p_q_pattern: "%kim%",
      p_limit: 20,
      p_offset: 40,
    });
    expect(j.total).toBe(250);
    expect((j.rows as Array<{ id: string }>).map((r) => r.id)).toEqual(["s2", "s1"]);
    expect(fake.calls.some((c) => c.table === "profiles")).toBe(false);
  });

  it("잘못된 status → 400 (RPC 없음)", async () => {
    const res = await restrictionsGET(req("/api/admin/community/restrictions", { status: "nope" }));
    expect(res.status).toBe(400);
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe("/api/admin/point-charges 공용 처리 — 닉네임 후보 200 상한 제거", () => {
  const gate = () => ({ actor: { userId: "admin-1" }, sb: fake.sb }) as never;

  it("텍스트 검색 → RPC(상태·패턴·limit/offset) · total = RPC · 행 순서 = ids 순서", async () => {
    rpcHandler = () => ({ data: { total: 640, ids: ["p2", "p1"] }, error: null });
    handler = (c) =>
      c.table === "point_charge_requests"
        ? { data: [{ id: "p1", user_id: U1 }, { id: "p2", user_id: U2 }], error: null }
        : { data: [], error: null };
    const j = await json(await handleAdminPointChargesListGet(gate(), req("/api/admin/point-charges", { status: "open", q: "kim_", limit: "100", offset: "200" })));
    expect(onlyRpc("admin_point_charge_requests_search_page").args).toMatchObject({
      p_statuses: ["pending", "waiting_confirm", "on_hold"],
      p_q_pattern: "%kim\\_%",
      p_limit: 100,
      p_offset: 200,
    });
    expect(j.total).toBe(640);
    expect((j.requests as Array<{ id: string }>).map((r) => r.id)).toEqual(["p2", "p1"]);
    expect(fake.calls.some((c) => c.table === "profiles" && c.limit)).toBe(false);
  });

  it("검색 없음·UUID 검색 → 기존 PostgREST 경로(range · exact count) 그대로 (다른 호출자 호환)", async () => {
    handler = (c) => (c.table === "point_charge_requests" ? { data: [], error: null, count: 9 } : { data: [], error: null });
    const j = await json(await handleAdminPointChargesListGet(gate(), req("/api/admin/point-charges", { status: "open", limit: "1" })));
    expect(fake.rpcCalls).toHaveLength(0);
    expect(j.total).toBe(9);
    expect(fake.calls.find((c) => c.table === "point_charge_requests")!.range).toEqual([0, 0]);
    fake.calls.length = 0;
    await handleAdminPointChargesListGet(gate(), req("/api/admin/point-charges", { q: U1 }));
    expect(fake.rpcCalls).toHaveLength(0);
    const call = fake.calls.find((c) => c.table === "point_charge_requests")!;
    expect(call.filters).toContainEqual(["or", "", `id.eq.${U1},user_id.eq.${U1}`]);
  });
});

describe("loadAdminMeetingReports — 검색 후보 100 상한 제거", () => {
  it("q → RPC(탭 묶음·기간·종류·패턴·페이지) · total·탭 건수 = RPC · 행 순서 = ids 순서", async () => {
    rpcHandler = () => ({
      data: { total: 180, tab_counts: { pending: 180, reviewing: 40, resolved: 10, rejected: 2, all: 192 }, ids: ["mr2", "mr1"] },
      error: null,
    });
    handler = (c) =>
      c.table === "meeting_reports"
        ? { data: [{ id: "mr1", status: "pending", reporter_user_id: U1 }, { id: "mr2", status: "reviewing", reporter_user_id: U2 }], error: null }
        : { data: [], error: null };
    const r = await loadAdminMeetingReports(
      "pending",
      { type: "member", fromIso: "2026-10-01T00:00:00Z", toIso: null, meetingIds: null, reporterIds: null, q: "Run (club)" },
      3,
      fake.sb as never,
      { pageSize: 20 }
    );
    expect(onlyRpc("admin_meeting_reports_page").args).toMatchObject({
      p_tab: "pending",
      p_type: "member",
      p_from: "2026-10-01T00:00:00Z",
      p_to: null,
      p_q_pattern: "%Run  club%",
      p_limit: 20,
      p_offset: 40,
      p_tab_groups: { pending: ["pending", "reviewing"], reviewing: ["reviewing"], resolved: ["resolved"], rejected: ["rejected"] },
    });
    expect(r.total).toBe(180);
    expect(r.counts).toEqual({ pending: 180, reviewing: 40, resolved: 10, rejected: 2, all: 192 });
    expect(r.rows.map((x) => x.id)).toEqual(["mr2", "mr1"]);
    expect(fake.calls.some((c) => c.table === "profiles" || (c.table === "meetings" && c.limit))).toBe(false);
  });

  it("q 없음 → 기존 경로(range) 그대로", async () => {
    handler = (c) => (c.table === "meeting_reports" ? { data: [], error: null, count: 3 } : { data: [], error: null });
    const r = await loadAdminMeetingReports("all", { type: "", fromIso: null, toIso: null, meetingIds: null, reporterIds: null }, 1, fake.sb as never);
    expect(fake.rpcCalls).toHaveLength(0);
    expect(r.total).toBe(3);
  });
});
