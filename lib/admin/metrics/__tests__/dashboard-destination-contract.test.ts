/**
 * 대시보드 값 = 이동 화면 값 — 지표 **전부**(레지스트리 `ADMIN_METRIC_DEFINITIONS`)에 대한 계약 (재설계 R8 · 수정 계획 1-1·1-4).
 *
 * 방법 (소스 문자열 비교 없음): 대시보드 출처(`createAdminDashboardSources`)와 이동 화면의 API·로더를 **실제로 실행**하고,
 * 두 쪽이 **같은 export 함수**를 **같은 필터·기간 인자**로 부르는지 함수 호출 기록으로 대조한다.
 *  - 이동 화면 인자 = 지표 링크(`resolveAdminMetricHref`)를 이동 화면이 API 에 보내는 쿼리로 바꾼 것.
 *  - 같은 함수·같은 인자 → 같은 DB 에서 같은 숫자 (운영 DB 대조표: 스크래치 r8-db-reconciliation.md).
 *  - 값은 가짜 DB 의 같은 응답으로 대시보드 값과 이동 화면 응답 total 이 같은지도 본다.
 * 마지막 테스트가 「레지스트리 지표 전부가 이 표에 있다」를 강제한다 (새 지표 = 계약 추가 필수).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 기록용 가짜 클라이언트·모듈 */
import { describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  type Call = [string, unknown[]];
  type Rec = { table: string; calls: Call[] };
  const state = {
    db: null as null | {
      sb: any;
      queries: Rec[];
      rpcCalls: { name: string; args: Record<string, unknown> }[];
    },
  };
  /** PostgREST 흉내 — 모든 체인 호출을 기록하고, await 하면 정해진 결과를 돌려준다. */
  function makeDb(opts: { count?: number; rpc?: Record<string, unknown> } = {}) {
    const queries: Rec[] = [];
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const chain = (rec: Rec): any =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
                Promise.resolve({ data: [], error: null, count: opts.count ?? 7 }).then(res, rej);
            }
            if (typeof prop === "symbol") return undefined;
            return (...args: unknown[]) => {
              rec.calls.push([prop, args]);
              return chain(rec);
            };
          },
        }
      );
    const sb = {
      from: (table: string) => {
        const rec: Rec = { table, calls: [] };
        queries.push(rec);
        return chain(rec);
      },
      rpc: (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return Promise.resolve({ data: opts.rpc?.[name] ?? null, error: null });
      },
    };
    const db = { sb, queries, rpcCalls };
    state.db = db;
    return db;
  }
  /** 모듈의 함수 export 를 실제 구현 그대로 호출 기록만 남기는 spy 로 감싼다. */
  function wrapAll(mod: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mod)) out[k] = typeof v === "function" ? vi.fn(v as (...a: any[]) => any) : v;
    return out;
  }
  const actor = { userId: "admin-1", role: "super_admin", permissions: [], isSuperAdmin: true, profile: null };
  return { state, makeDb, wrapAll, actor };
});

// ── 인증·클라이언트 (모든 이동 화면 API 가 가짜 DB 를 쓰게 한다) ──
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/require-admin-permission", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  requireAdminPermission: async () => ({ ok: true, sb: H.state.db!.sb, actor: H.actor, userId: H.actor.userId }),
  requireAdminApiActor: async () => ({ ok: true, sb: H.state.db!.sb, actor: H.actor, userId: H.actor.userId }),
}));
vi.mock("@/lib/admin/require-admin-api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  requireAdminApiUser: async () => ({ ok: true, userId: H.actor.userId }),
}));
vi.mock("@/lib/auth/is-route-admin", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isRouteAdmin: async () => true,
}));
vi.mock("@/lib/stores/try-supabase-stores", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  tryGetSupabaseForStores: () => H.state.db!.sb,
}));
vi.mock("@/lib/supabase/try-supabase-server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  tryCreateSupabaseServiceClient: () => H.state.db!.sb,
}));
vi.mock("@/lib/chat/supabase-server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSupabaseServer: () => H.state.db!.sb,
}));
vi.mock("@supabase/supabase-js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createClient: () => H.state.db!.sb,
}));
vi.mock("@/lib/env/runtime", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  requireSupabaseEnv: () => ({ ok: true, url: "http://supabase.local", serviceKey: "service", anonKey: "anon" }),
}));
// 서버 페이지가 렌더하는 클라이언트 화면 (데이터 로딩만 본다)
vi.mock("@/components/admin/community/AdminCommunityReportsPage", () => ({ AdminCommunityReportsPage: () => null }));
vi.mock("@/components/admin/philife/AdminMeetingReportsPage", () => ({ AdminMeetingReportsPage: () => null }));
vi.mock("@/components/admin/philife/AdminPhilifeMeetingReportsHeader", () => ({ AdminPhilifeMeetingReportsHeader: () => null }));

// ── 공용 카운트 함수 — 실제 구현 + 호출 기록 ──
vi.mock("@/lib/admin/metrics/admin-metric-filters", async (orig) => H.wrapAll(await orig<Record<string, unknown>>()));
vi.mock("@/lib/admin-users/admin-member-list-query", async (orig) => H.wrapAll(await orig<Record<string, unknown>>()));
vi.mock("@/lib/admin/advertising-workspace/workspace-summary", async (orig) =>
  H.wrapAll(await orig<Record<string, unknown>>())
);
vi.mock("@/lib/stores/commission/store-commission-contract", async (orig) =>
  H.wrapAll(await orig<Record<string, unknown>>())
);
vi.mock("@/lib/admin/trade-admin/trade-posts-query", async (orig) => {
  const m = await orig<Record<string, any>>();
  return {
    ...m,
    parseTradePostsFilter: vi.fn(m.parseTradePostsFilter),
    loadTradePostsContext: vi.fn(async () => ({
      ok: true,
      ctx: { activeTradeCategoryIds: ["c1"], allTradeCategoryIds: ["c1"], reportedPostIds: [], legacyLguPairs: [] },
    })),
    countTradePosts: vi.fn(async () => 7),
    listTradePosts: vi.fn(async () => ({ ok: true, rows: [], total: 7 })),
    resolveTradePostLguIds: vi.fn(async () => new Map()),
  };
});
vi.mock("@/lib/admin-business/load-admin-business-list", async (orig) => {
  const m = await orig<Record<string, any>>();
  return {
    ...m,
    parseAdminBusinessListOpsFilters: vi.fn(m.parseAdminBusinessListOpsFilters),
    loadAdminBusinessListOps: vi.fn(async (_sb: unknown, f: { page?: number; pageSize?: number }) => ({
      ok: true,
      stores: [],
      total: 3,
      page: f.page ?? 1,
      pageSize: f.pageSize ?? 20,
      kpi: { totalStores: 9, openNow: 3, closedNow: 6, pendingApproval: 0, restricted: 0 },
      filterOptions: {},
    })),
  };
});
vi.mock("@/lib/finance/today-summary/load-finance-today-summary", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadFinanceTodaySummary: vi.fn(async () => ({
    day: "2026-10-20",
    fromIso: "2026-10-19T16:00:00.000Z",
    toIso: "2026-10-20T16:00:00.000Z",
    cashInMinor: 50_000,
    cashOutMinor: 0,
    coinEarned: 0,
    coinConverted: 0,
    unavailable: false,
    errors: [],
  })),
}));
vi.mock("@/lib/stores/commission/load-store-commission-ledger", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadAdminStoreCashOverviewIds: vi.fn(async () => ["s1", "s2"]),
  loadStoreCashOverview: vi.fn(async () => ({
    positions: [
      { storeId: "s1", balanceMinor: 0, outstandingMinor: 1200, netMinor: -1200, gateMode: "off", orderable: true },
      { storeId: "s2", balanceMinor: 500, outstandingMinor: 300, netMinor: 200, gateMode: "off", orderable: true },
    ],
    storeNames: {},
  })),
  loadStoreCommissionLedgerPage: vi.fn(async () => ({ rows: [], totalRows: 3, summary: { netCommissionMinor: 4200 } })),
  loadStoreCommissionBreakdown: vi.fn(async () => []),
  loadStorePlatformPayable: vi.fn(async () => ({ rows: [], totalRows: 0, summary: {} })),
}));
vi.mock("@/lib/stores/commission/store-commission-writer", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadStoreCashOrderGateSetting: vi.fn(async () => ({ mode: "off" })),
}));
vi.mock("@/lib/admin/ads-control-plane/load-ads-control-plane", () => ({
  loadAdsControlPlane: vi.fn(async () => ({
    generatedAt: "2026-10-20T09:27:00.000Z",
    actionRequired: [],
    applications: [],
    creatives: [],
    recent: [],
    currentExecution: [],
    collisions: [],
    occupancy: [{ placementKey: "STORES_HOME_HERO", capacity: 5, vacant: 2, liveCount: 3, reservedCount: 0 }],
  })),
}));
vi.mock("@/lib/community-feed/admin-community-reports", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listCommunityReportGroupsForAdmin: vi.fn(async () => ({
    ok: true,
    groups: [],
    total: 4,
    counts: { pending: 4, reviewing: 1, resolved: 0, dismissed: 0, all: 5 },
    limit: 50,
    offset: 0,
    truncated: false,
  })),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-list-service", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listAdminNotificationCampaigns: vi.fn(async (_svc: unknown, q: { page: number; pageSize: number }) => ({
    ok: true,
    campaigns: [],
    total: 2,
    page: q.page,
    page_size: q.pageSize,
    archive_supported: true,
  })),
}));

import { createAdminDashboardSources } from "@/lib/admin/metrics/load-admin-dashboard-sources";
import { buildAdminDashboardOverview } from "@/lib/admin/metrics/build-admin-dashboard-overview";
import { resolveAdminDashboardPeriod, type AdminDashboardPeriod } from "@/lib/admin/metrics/dashboard-period";
import { ADMIN_METRIC_BY_ID, ADMIN_METRIC_DEFINITIONS, resolveAdminMetricHref } from "@/lib/admin/metrics/registry";
import { ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY } from "@/lib/admin/admin-action-queue-registry";
import * as filters from "@/lib/admin/metrics/admin-metric-filters";
import * as memberQuery from "@/lib/admin-users/admin-member-list-query";
import * as tradePosts from "@/lib/admin/trade-admin/trade-posts-query";
import * as business from "@/lib/admin-business/load-admin-business-list";
import * as financeToday from "@/lib/finance/today-summary/load-finance-today-summary";
import * as ledger from "@/lib/stores/commission/load-store-commission-ledger";
import * as commissionContract from "@/lib/stores/commission/store-commission-contract";
import * as adsSummary from "@/lib/admin/advertising-workspace/workspace-summary";
import * as communityReports from "@/lib/community-feed/admin-community-reports";
import * as campaigns from "@/lib/admin/notification-campaigns/campaign-list-service";
import { parseCampaignListQuery } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { adminSupportTabFromLegacyFilter } from "@/lib/support/support-case-types";
import { parseAdminOrderOpsQuery, adminOrderOpsQueryToParams } from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { parseMemberListQueryState } from "@/lib/admin-users/member-list-presentation";

import { GET as usersGET } from "@/app/api/admin/users/route";
import { GET as deletionGET } from "@/app/api/admin/account-deletion-requests/route";
import { GET as tradeReportsGET } from "@/app/api/admin/trade/reports/route";
import { GET as tradePostsGET } from "@/app/api/admin/trade/posts/route";
import { GET as storesGET } from "@/app/api/admin/stores/route";
import { GET as supportGET } from "@/app/api/admin/support/cases/route";
import { GET as communityPostsGET } from "@/app/api/admin/community/engine/posts/route";
import { GET as businessGET } from "@/app/api/admin/business/ops-list/route";
import { GET as pointsGET } from "@/app/api/admin/point-charges/route";
import { GET as financeGET } from "@/app/api/admin/finance-control-plane/route";
import { GET as ledgerGET } from "@/app/api/admin/store-commission-ledger/route";
import { GET as adsGET } from "@/app/api/admin/ads-control-plane/route";
import { GET as ordersGET } from "@/app/api/admin/store-orders/ops/route";
import { GET as notificationsGET } from "@/app/api/admin/notification-campaigns/route";
import CommunityReportsPage from "@/app/admin/community/reports/page";
import MeetingReportsPage from "@/app/admin/philife/meeting-reports/page";

const NOW = new Date("2026-10-20T09:27:00Z"); // 17:27 PHT
const ORDER_RPC = {
  admin_store_order_ops_page: { total: 11, rows: [], tab_counts: { all: 11, in_progress: 6, completed: 4, cancel: 1, refund: 0 } },
};

/** 계약을 확인한 지표 id — 마지막 테스트가 레지스트리 전체와 같은지 본다. */
const COVERED = new Set<string>();
const cover = (...ids: string[]) => ids.forEach((id) => COVERED.add(id));

function setup(period: AdminDashboardPeriod = "today") {
  const db = H.makeDb({ rpc: ORDER_RPC });
  const range = resolveAdminDashboardPeriod(period, NOW);
  const sources = createAdminDashboardSources({
    sb: db.sb,
    storesSb: db.sb,
    notesSb: db.sb,
    scope: { isSuperAdmin: true, permissions: [] },
    range,
    now: NOW,
  });
  return { db, range, sources };
}

function hrefOf(metricId: string, range: ReturnType<typeof resolveAdminDashboardPeriod>): string {
  return resolveAdminMetricHref(ADMIN_METRIC_BY_ID.get(metricId)!, { todayPht: "2026-10-20", range });
}
function hrefParams(metricId: string, range: ReturnType<typeof resolveAdminDashboardPeriod>): URLSearchParams {
  return new URL(hrefOf(metricId, range), "http://x").searchParams;
}
function queueListParams(key: string): URLSearchParams {
  return new URL(ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(key as never)!.listHref!, "http://x").searchParams;
}
const req = (path: string, params: URLSearchParams | Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}?${new URLSearchParams(params as Record<string, string>).toString()}`);

/** 한 단계(대시보드 또는 이동 화면)를 실행하고 그 동안의 spy 호출만 남긴다. 화면 쪽 후처리 실패는 무시(호출 기록이 목적). */
async function phase<T>(run: () => Promise<T>): Promise<T | null> {
  vi.clearAllMocks();
  return run().catch(() => null);
}
/** spy 호출 인자 (첫 인자가 PostgREST 빌더·클라이언트면 뺀다) */
function argsOf(fn: unknown, dropFirst = true): unknown[][] {
  return (fn as Mock).mock.calls.map((c) => (dropFirst ? c.slice(1) : c));
}
async function json(res: Response | null): Promise<any> {
  return res ? res.json() : null;
}

describe("회원 6 — 회원 목록 API(/api/admin/users)와 같은 필터 연산 함수", () => {
  for (const period of ["today", "yesterday", "7d", "30d"] as const) {
    it(`신규 가입 (${period}): adminMemberJoinedRangeOps — 대시보드 인자 = 링크를 목록이 읽은 인자`, async () => {
      const { range, sources } = setup(period);
      await phase(() => sources.metrics("members"));
      const dash = argsOf(memberQuery.adminMemberJoinedRangeOps, false);
      const state = parseMemberListQueryState(hrefParams("members.new", range));
      await phase(() => usersGET(req("/api/admin/users", { joinedFrom: state.joinedFrom, joinedTo: state.joinedTo }) as any));
      const screen = argsOf(memberQuery.adminMemberJoinedRangeOps, false);
      expect(screen).toContainEqual([range.fromDay, range.toDay]);
      expect(dash).toContainEqual([range.fromDay, range.toDay]);
    });
  }

  it("활성·정지·차단: adminMemberStatusFilterOps(status) — 링크 status 그대로 · 전체 = 필터 없음", async () => {
    const { db, range, sources } = setup();
    const map = await phase(() => sources.metrics("members"));
    const dash = argsOf(memberQuery.adminMemberStatusFilterOps, false);
    for (const id of ["members.active", "members.suspended", "members.blocked"]) {
      const status = parseMemberListQueryState(hrefParams(id, range)).status!;
      await phase(() => usersGET(req("/api/admin/users", { status }) as any));
      expect(argsOf(memberQuery.adminMemberStatusFilterOps, false), id).toContainEqual([status]);
      expect(dash, id).toContainEqual([status]);
      expect(map?.get(id)?.value, id).toBe(7);
    }
    expect(hrefOf("members.total", range)).toBe("/admin/users");
    expect(db.queries.some((q) => q.table === "profiles" && q.calls.length === 1)).toBe(true); // 필터 없는 COUNT
    cover("members.total", "members.active", "members.new", "members.suspended", "members.blocked");
  });

  it("탈퇴 요청: applyAccountDeletionRequestStatusFilter(open) — 화면 API(status=open) 와 같은 함수·인자", async () => {
    const { range, sources } = setup();
    const map = await phase(() => sources.metrics("members"));
    const dash = argsOf(filters.applyAccountDeletionRequestStatusFilter);
    const res = await phase(() => deletionGET(req("/api/admin/account-deletion-requests", { status: "open", limit: "30" })));
    expect(argsOf(filters.applyAccountDeletionRequestStatusFilter)).toEqual([["open"]]);
    expect(dash).toEqual([[hrefParams("members.deletion_requests", range).get("status") ?? "open"]]);
    expect((await json(res)).total).toBe(map?.get("members.deletion_requests")?.value);
    cover("members.deletion_requests");
  });
});

describe("처리 대기 7 — 합계·P0 = 처리 대기 목록 합 · 카테고리 = 목록 화면과 같은 함수", () => {
  it("합계·P0 = 처리 대기 목록 합계 (권한 제한 관리자 포함 — 목록을 열 수 없는 카테고리는 양쪽 다 뺀다)", async () => {
    const { sources, range } = setup();
    for (const actor of [
      { role: "super_admin", permissions: [] as string[] },
      { role: "admin", permissions: ["reports", "ads"] as string[] },
    ]) {
      const p = await buildAdminDashboardOverview({
        tab: "overview",
        parts: new Set(["band", "pending"]),
        range,
        actor,
        sources,
        now: NOW,
      });
      const band = p.band?.find((b) => b.id === "pending");
      expect(band?.primary.value, actor.role).toBe(p.pending?.total);
      const p0 = p.pending?.items.filter((i) => i.priority === "P0_CRITICAL").reduce((n, i) => n + (i.count ?? 0), 0);
      expect(band?.secondary?.value ?? 0, actor.role).toBe(p0);
    }
    cover("queue.total", "queue.p0");
  });

  it("입점 심사: applyStoreApprovalStatusFilter(actionable) — /api/admin/stores?status=actionable 와 같은 함수", async () => {
    const { sources } = setup();
    await phase(() => sources.queue());
    expect(argsOf(filters.applyStoreApprovalStatusFilter)).toContainEqual(["actionable"]);
    const sp = queueListParams("store_applications");
    await phase(() => storesGET(req("/api/admin/stores", { page: "1", page_size: "20", status: sp.get("status")! })));
    expect(argsOf(filters.applyStoreApprovalStatusFilter)).toContainEqual(["actionable"]);
    cover("queue.store_applications");
  });

  it("고객지원 미처리: applySupportCaseTabFilter(ACTIONABLE) — 화면 탭(legacy filter → tab) API 와 같은 함수", async () => {
    const { sources } = setup();
    await phase(() => sources.queue());
    expect(argsOf(filters.applySupportCaseTabFilter)).toContainEqual(["ACTIONABLE"]);
    const { tab } = adminSupportTabFromLegacyFilter(queueListParams("support_actionable").get("filter"));
    await phase(() => supportGET(req("/api/admin/support/cases", { tab, limit: "20", offset: "0" })));
    expect(argsOf(filters.applySupportCaseTabFilter)).toContainEqual([tab]);
    expect(tab).toBe("ACTIONABLE");
    cover("queue.support_actionable");
  });

  it("모임 신고: applyMeetingReportTabFilter(pending) — 모임 신고 화면(서버 페이지) 로더와 같은 함수", async () => {
    const { sources } = setup();
    await phase(() => sources.queue());
    expect(argsOf(filters.applyMeetingReportTabFilter)).toContainEqual(["pending"]);
    const status = new URL(ADMIN_METRIC_BY_ID.get("queue.meeting_reports")!.href as string, "http://x").searchParams.get("status");
    await phase(() => MeetingReportsPage({ searchParams: Promise.resolve(status ? { status } : {}) }));
    expect(argsOf(filters.applyMeetingReportTabFilter)).toContainEqual([filters.resolveMeetingReportTab(status)]);
    cover("queue.meeting_reports");
  });

  it("수수료 검토: loadStoreCommissionLedgerPage — 처리 대기 값 = 원장 「검토 필요」 API 와 같은 인자의 total", async () => {
    const { sources } = setup();
    const cats = await phase(() => sources.queue());
    const dash = argsOf(ledger.loadStoreCommissionLedgerPage);
    expect(cats?.find((c) => c.key === "settlements_actionable")?.count).toBe(3);
    const res = await phase(() => ledgerGET(req("/api/admin/store-commission-ledger", queueListParams("settlements_actionable"))));
    const screen = argsOf(ledger.loadStoreCommissionLedgerPage);
    const strip = (a: unknown[]) => {
      const { limit: _l, offset: _o, ...rest } = a[0] as Record<string, unknown>;
      return rest;
    };
    expect(dash.map(strip)).toContainEqual(strip(screen[0]));
    expect((await json(res)).totalRows).toBe(3);
    cover("queue.settlements_actionable");
  });

  it("주문 운영 예외: loadAdminOrderOpsPage(exceptions) — 처리 대기 값 = 처리 필요 주문 화면 API 와 같은 RPC 인자", async () => {
    const { db, sources } = setup();
    const cats = await phase(() => sources.queue());
    expect(cats?.find((c) => c.key === "orders_attention")?.count).toBe(11);
    const dash = db.rpcCalls.filter((c) => c.name === "admin_store_order_ops_page").map((c) => c.args);
    db.rpcCalls.length = 0;
    const q = parseAdminOrderOpsQuery("exceptions", queueListParams("orders_attention"));
    const params = adminOrderOpsQueryToParams(q, { includePaging: true });
    params.set("screen", "exceptions");
    const res = await phase(() => ordersGET(req("/api/admin/store-orders/ops", params)));
    const screen = db.rpcCalls.filter((c) => c.name === "admin_store_order_ops_page").map((c) => c.args);
    const strip = ({ p_limit: _l, p_offset: _o, ...rest }: Record<string, unknown>) => rest;
    expect(dash.map(strip)).toContainEqual(strip(screen[0]));
    expect((await json(res)).total).toBe(11);
    cover("queue.orders_attention");
  });
});

describe("커뮤니티 2", () => {
  it("공개 게시글: applyCommunityPostStatusOriginFilter — 화면(tab→status, origin) API 와 같은 인자", async () => {
    const { range, sources } = setup();
    const map = await phase(() => sources.metrics("community"));
    const dash = argsOf(filters.applyCommunityPostStatusOriginFilter);
    const sp = hrefParams("community.posts_active.member", range);
    // 커뮤니티 글 화면: tab(전체·신고 외) → status, origin 그대로 (AdminPostsPageContent apiQuery)
    const res = await phase(() =>
      communityPostsGET(req("/api/admin/community/engine/posts", { status: sp.get("tab")!, origin: sp.get("origin")!, limit: "50", offset: "0" }))
    );
    const screen = argsOf(filters.applyCommunityPostStatusOriginFilter);
    expect(screen[0]).toEqual(dash[0]);
    expect(dash[0]).toEqual([{ status: "active", origin: "member" }]);
    expect((await json(res)).total).toBe(map?.get("community.posts_active.member")?.value);
    cover("community.posts_active.member");
  });

  it("신고 대기 (단위 = 신고 대상 묶음): 지표 · 처리 대기 항목 · 신고 처리함이 같은 함수·같은 인자", async () => {
    const { range, sources } = setup();
    const map = await phase(() => sources.metrics("community_reports"));
    const dash = argsOf(communityReports.listCommunityReportGroupsForAdmin, false);
    const sp = hrefParams("community.report_targets_pending", range);
    await phase(() => CommunityReportsPage({ searchParams: Promise.resolve(Object.fromEntries(sp.entries())) }));
    const screen = argsOf(communityReports.listCommunityReportGroupsForAdmin, false);
    const strip = (a: unknown[]) =>
      Object.fromEntries(
        Object.entries(a[0] as Record<string, unknown>).filter(([k, v]) => k !== "limit" && k !== "offset" && v !== undefined)
      );
    expect(strip(dash[0])).toEqual(strip(screen[0]));
    expect(map?.get("community.report_targets_pending")?.value).toBe(4);
    // 같은 화면의 처리 대기 「커뮤니티 신고」도 같은 단위·같은 값 (행 수 7 이 아니라 묶음 수 4)
    const cats = await sources.queue();
    expect(cats.find((c) => c.key === "community_reports")?.count).toBe(4);
    cover("community.report_targets_pending");
  });
});

describe("거래 4 — 거래글 목록·거래 신고 API 와 같은 함수", () => {
  it("판매중·거래완료·관리자 숨김: countTradePosts(tab, parseTradePostsFilter(링크)) = 목록 tabCounts", async () => {
    const { range, sources } = setup();
    const map = await phase(() => sources.metrics("trade"));
    const dash = argsOf(tradePosts.countTradePosts);
    for (const id of ["trade.posts.selling", "trade.posts.sold", "trade.posts.admin_hidden"]) {
      const sp = hrefParams(id, range);
      const res = await phase(() => tradePostsGET(req("/api/admin/trade/posts", sp)));
      const screen = argsOf(tradePosts.countTradePosts).map((a) => a.slice(0, 2));
      const tab = sp.get("tab")!;
      const dashForTab = dash.map((a) => a.slice(0, 2)).find((a) => a[0] === tab);
      expect(dashForTab, id).toBeDefined();
      expect(screen, id).toContainEqual(dashForTab);
      expect((await json(res)).tabCounts?.[tab], id).toBe(map?.get(id)?.value);
    }
    cover("trade.posts.selling", "trade.posts.sold", "trade.posts.admin_hidden");
  });

  it("거래 신고 대기: applyTradeReportTabFilter(open) — /api/admin/trade/reports?tab=open 과 같은 함수", async () => {
    const { range, sources } = setup();
    const map = await phase(() => sources.metrics("trade"));
    expect(argsOf(filters.applyTradeReportTabFilter)).toContainEqual(["open"]);
    const sp = hrefParams("trade.reports_open", range);
    const res = await phase(() => tradeReportsGET(req("/api/admin/trade/reports", { tab: sp.get("tab")!, period: "all", limit: "50", offset: "0" })));
    expect(argsOf(filters.applyTradeReportTabFilter)).toContainEqual([sp.get("tab")]);
    expect((await json(res)).total).toBe(map?.get("trade.reports_open")?.value);
    cover("trade.reports_open");
  });
});

describe("배달·매장 5", () => {
  for (const period of ["today", "yesterday", "7d", "30d"] as const) {
    it(`주문 4 (${period}): 주문 목록 API 와 같은 RPC 인자 · 탭 개수`, async () => {
      const { db, range, sources } = setup(period);
      const map = await phase(() => sources.metrics("orders"));
      const dash = db.rpcCalls.find((c) => c.name === "admin_store_order_ops_page")!.args;
      for (const [id, tab] of [
        ["orders.all", "all"],
        ["orders.in_progress", "in_progress"],
        ["orders.completed", "completed"],
        ["orders.cancel", "cancel"],
      ] as const) {
        db.rpcCalls.length = 0;
        const params = new URLSearchParams(hrefParams(id, range));
        params.set("screen", "list");
        const res = await phase(() => ordersGET(req("/api/admin/store-orders/ops", params)));
        const screen = db.rpcCalls.find((c) => c.name === "admin_store_order_ops_page")!.args;
        for (const k of ["p_from", "p_to", "p_basis", "p_tab_groups", "p_scope_statuses", "p_queue_closed_statuses", "p_q", "p_store_id"]) {
          expect(dash[k], `${id}.${k}`).toEqual(screen[k]);
        }
        expect(screen.p_tab ?? "all", id).toBe(tab);
        const body = await json(res);
        expect(map?.get(id)?.value, id).toBe(body.tabCounts[tab]);
        cover(id);
      }
    });
  }

  it("영업 중 매장: loadAdminBusinessListOps(parseAdminBusinessListOpsFilters(링크)) KPI — 매장 운영 목록 API 와 같은 인자", async () => {
    const { range, sources } = setup();
    const map = await phase(() => sources.metrics("stores"));
    const dash = argsOf(business.loadAdminBusinessListOps);
    const res = await phase(() => businessGET(req("/api/admin/business/ops-list", hrefParams("stores.open_now", range))));
    const screen = argsOf(business.loadAdminBusinessListOps);
    const strip = (a: unknown[]) => {
      const { page: _p, pageSize: _s, ...rest } = a[0] as Record<string, unknown>;
      return rest;
    };
    expect(strip(dash[0])).toEqual(strip(screen[0]));
    expect((await json(res)).kpi.openNow).toBe(map?.get("stores.open_now")?.value);
    cover("stores.open_now");
  });
});

describe("결제·정산 5", () => {
  it("포인트 충전 2: 상태별 건수 질의 = 화면 API(counts=1) 질의 · 링크 status 필터", async () => {
    const { db, range, sources } = setup();
    const map = await phase(() => sources.metrics("points"));
    const statusCounts = (from: number) =>
      db.queries
        .slice(from)
        .filter((q) => q.table === "point_charge_requests" && q.calls.length === 2 && q.calls[1][0] === "eq")
        .map((q) => q.calls[1][1][1] as string)
        .sort();
    const dash = statusCounts(0);
    expect(dash.length).toBeGreaterThan(0);
    for (const id of ["points.waiting_confirm", "points.pending"]) {
      const sp = hrefParams(id, range);
      const mark = db.queries.length;
      const res = await phase(() => pointsGET(req("/api/admin/point-charges", { status: sp.get("status")!, counts: "1" }) as any));
      expect(statusCounts(mark), id).toEqual(dash);
      const list = db.queries.slice(mark).find((q) => q.table === "point_charge_requests" && q.calls.some((c) => c[0] === "in"));
      expect(list?.calls.find((c) => c[0] === "in")?.[1], id).toEqual(["request_status", [sp.get("status")]]);
      const body = await json(res);
      expect(body.statusCounts[sp.get("status")!], id).toBe(map?.get(id)?.value);
    }
    cover("points.waiting_confirm", "points.pending");
  });

  it("오늘 Cash 유입: loadFinanceTodaySummary — 재무 현황 API 와 같은 함수", async () => {
    const { sources } = setup();
    const map = await phase(() => sources.metrics("finance_today"));
    expect(financeToday.loadFinanceTodaySummary).toHaveBeenCalledTimes(1);
    const res = await phase(() => financeGET());
    expect(financeToday.loadFinanceTodaySummary).toHaveBeenCalledTimes(1);
    const body = await json(res);
    if (body?.ok) expect(body.plane.todaySummary.cashInMinor).toBe(map?.get("finance.cash_in_today")?.value);
    expect(map?.get("finance.cash_in_today")?.value).toBe(50_000);
    cover("finance.cash_in_today");
  });

  it("미납 수수료: sumStoreCashOutstandingMinor(loadStoreCashOverview(같은 대상)) — 원장 API 「미납 관리」와 같은 함수", async () => {
    const { range, sources } = setup();
    const map = await phase(() => sources.metrics("commission"));
    const dashIds = argsOf(ledger.loadStoreCashOverview);
    expect(commissionContract.sumStoreCashOutstandingMinor).toHaveBeenCalled();
    const res = await phase(() => ledgerGET(req("/api/admin/store-commission-ledger", hrefParams("finance.commission_outstanding", range))));
    expect(argsOf(ledger.loadStoreCashOverview)).toEqual(dashIds);
    const body = await json(res);
    expect(commissionContract.sumStoreCashOutstandingMinor(body.positions)).toBe(map?.get("finance.commission_outstanding")?.value);
    expect(map?.get("finance.commission_outstanding")?.value).toBe(1500);
    cover("finance.commission_outstanding");
  });

  for (const period of ["today", "yesterday", "7d", "30d"] as const) {
    it(`순 수수료 (${period}): loadStoreCommissionLedgerPage — 링크 기간을 원장 API 가 읽은 인자 · summary`, async () => {
      const { range, sources } = setup(period);
      const map = await phase(() => sources.metrics("commission"));
      const dash = argsOf(ledger.loadStoreCommissionLedgerPage);
      const res = await phase(() => ledgerGET(req("/api/admin/store-commission-ledger", hrefParams("finance.commission_net", range))));
      const screen = argsOf(ledger.loadStoreCommissionLedgerPage);
      const strip = (a: unknown[]) => {
        const { limit: _l, offset: _o, ...rest } = a[0] as Record<string, unknown>;
        return rest;
      };
      expect(strip(dash[0])).toEqual(strip(screen[0]));
      expect((dash[0][0] as { fromIso: string }).fromIso).toBe(range.fromIso);
      expect((await json(res)).summary.netCommissionMinor).toBe(map?.get("finance.commission_net")?.value);
      cover("finance.commission_net");
    });
  }
});

describe("광고 6 — 광고 운영 화면 API 모델 + 화면 요약 함수", () => {
  it("노출·승인 대기·예약·노출 대기·불완전·홈 배너: 대시보드 = computeAdsWorkspace*(화면 API plane, 화면 mode=all)", async () => {
    const { sources } = setup();
    const map = await phase(() => sources.metrics("ads"));
    const dashArgs = argsOf(adsSummary.computeAdsWorkspaceSummaryCounts, false);
    const res = await phase(() => adsGET(req("/api/admin/ads-control-plane")));
    const plane = (await json(res)).plane;
    // 화면(/admin/advertising = AdminAdvertisingWorkspace mode 기본 "all")이 같은 plane 으로 같은 함수를 부른다
    expect(dashArgs[0][1]).toBe("all");
    expect(JSON.parse(JSON.stringify(dashArgs[0][0]))).toEqual(plane);
    const screen = adsSummary.computeAdsWorkspaceSummaryCounts(plane, "all");
    const hero = adsSummary.computeAdsWorkspaceHeroOccupancy(plane);
    expect(map?.get("ads.live")?.value).toBe(screen.live);
    expect(map?.get("ads.pending")?.value).toBe(screen.pending);
    expect(map?.get("ads.scheduled")?.value).toBe(screen.scheduled);
    expect(map?.get("ads.waiting")?.value).toBe(screen.waiting);
    expect(map?.get("ads.incomplete")?.value).toBe(screen.incomplete);
    expect(map?.get("ads.hero_used")?.value).toBe(hero.used);
    cover("ads.live", "ads.pending", "ads.scheduled", "ads.waiting", "ads.incomplete", "ads.hero_used");
  });
});

describe("고객지원·알림 3 — 알림 발송 화면 API 와 같은 질의", () => {
  it("발송 실패·일부 실패·진행 중: listAdminNotificationCampaigns(parseCampaignListQuery(링크)) total", async () => {
    const { range, sources } = setup();
    const map = await phase(() => sources.metrics("notifications"));
    const dash = argsOf(campaigns.listAdminNotificationCampaigns);
    const ids = ["notifications.campaigns_failed", "notifications.campaigns_partially_failed", "notifications.campaigns_in_progress"];
    for (const id of ids) {
      const sp = hrefParams(id, range);
      const res = await phase(() => notificationsGET(req("/api/admin/notification-campaigns", sp)));
      const screen = argsOf(campaigns.listAdminNotificationCampaigns);
      const strip = (q: unknown) => {
        const { page: _p, pageSize: _s, ...rest } = q as Record<string, unknown>;
        return rest;
      };
      expect(screen[0][0]).toEqual(parseCampaignListQuery(sp));
      expect(dash.map((a) => strip(a[0])), id).toContainEqual(strip(screen[0][0]));
      expect((await json(res)).total, id).toBe(map?.get(id)?.value);
    }
    cover(...ids);
  });
});

describe("계약 범위", () => {
  it("레지스트리 지표 전부가 이 계약 표에 있다 (새 지표 = 계약 추가)", () => {
    const all = ADMIN_METRIC_DEFINITIONS.map((d) => d.id).sort();
    expect([...COVERED].sort()).toEqual(all);
  });
});
