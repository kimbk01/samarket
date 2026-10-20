/**
 * 대시보드 값 = 이동 화면 값 (수정 계획 1-1 · 1-4).
 * 지표 링크의 주소를 **이동 화면의 파서**로 읽어 만든 질의와, 대시보드 출처가 실제로 보낸 질의가 같은지 본다.
 * (같은 함수·같은 필터면 같은 DB 에서 같은 숫자가 나온다 — 운영 DB 대조는 PR 보고의 읽기 전용 SQL 표.)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/community-feed/admin-community-reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/community-feed/admin-community-reports")>()),
  listCommunityReportGroupsForAdmin: vi.fn(async () => ({ ok: true, counts: { pending: 4 } })),
}));

import { createAdminDashboardSources } from "@/lib/admin/metrics/load-admin-dashboard-sources";
import { resolveAdminDashboardPeriod } from "@/lib/admin/metrics/dashboard-period";
import { ADMIN_METRIC_BY_ID, resolveAdminMetricHref } from "@/lib/admin/metrics/registry";
import {
  adminOrderOpsRpcArgs,
  parseAdminOrderOpsQuery,
} from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { parseMemberListQueryState } from "@/lib/admin-users/member-list-presentation";
import {
  adminMemberJoinedRangeOps,
  adminMemberStatusFilterOps,
  type ProfileFilterOp,
} from "@/lib/admin-users/admin-member-list-query";
import { parseStoreCommissionLedgerQuery } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  listCommunityReportGroupsForAdmin,
  resolveCommunityReportInboxTab,
} from "@/lib/community-feed/admin-community-reports";

const NOW = new Date("2026-10-20T09:27:00Z"); // 17:27 PHT

type Call = { table?: string; method: string; args: unknown[] };

/** PostgREST 흉내 — 체인 호출을 기록하고, await 하면 정해진 결과를 돌려준다. */
function recordingClient(opts: { rpc?: Record<string, unknown>; count?: number } = {}) {
  const queries: Call[][] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const builder = (calls: Call[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "or", "not", "gte", "lt", "lte", "order", "limit", "range"]) {
      b[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: opts.count ?? 7 });
    return b;
  };
  const sb = {
    from: (table: string) => {
      const calls: Call[] = [{ table, method: "from", args: [table] }];
      queries.push(calls);
      return builder(calls);
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: opts.rpc?.[name] ?? {}, error: null };
    },
  };
  return { sb, queries, rpcCalls };
}

function sourcesFor(period: "today" | "yesterday" | "7d" | "30d", client: ReturnType<typeof recordingClient>) {
  const range = resolveAdminDashboardPeriod(period, NOW);
  const sources = createAdminDashboardSources({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 기록용 가짜 클라이언트
    sb: client.sb as any,
    storesSb: null,
    notesSb: null,
    scope: { isSuperAdmin: true, permissions: [] },
    range,
    now: NOW,
  });
  return { range, sources };
}

function hrefParams(metricId: string, range: ReturnType<typeof resolveAdminDashboardPeriod>): URLSearchParams {
  const href = resolveAdminMetricHref(ADMIN_METRIC_BY_ID.get(metricId)!, { todayPht: "2026-10-20", range });
  return new URL(href, "http://x").searchParams;
}

/** 필터 연산 → 체인 호출 (applyProfileFilterOps 와 같은 순서). */
function opsAsCalls(ops: readonly ProfileFilterOp[]): Array<[string, unknown[]]> {
  return ops.map((op) =>
    op.type === "not_in"
      ? ["not", [op.column, "in", op.value]]
      : op.type === "or"
        ? ["or", [op.value]]
        : [op.type, [op.column, op.value]]
  );
}

describe("회원 — 회원 목록(/api/admin/users)과 같은 필터 연산", () => {
  for (const period of ["today", "yesterday", "7d", "30d"] as const) {
    it(`신규 가입 (${period}) = 링크의 joinedFrom·joinedTo 를 목록 파서로 읽은 PHT 경계`, async () => {
      const client = recordingClient();
      const { range, sources } = sourcesFor(period, client);
      const map = await sources.metrics("members");
      expect(map.get("members.new")?.value).toBe(7);
      const state = parseMemberListQueryState(hrefParams("members.new", range));
      const expected = opsAsCalls(adminMemberJoinedRangeOps(state.joinedFrom, state.joinedTo));
      const q = client.queries.find((c) => c.some((x) => x.method === "gte"));
      expect(q?.[0].table).toBe("profiles");
      expect(q?.slice(2).map((c) => [c.method, c.args])).toEqual(expected);
    });
  }

  it("활성·정지·차단 = 링크 status 를 목록 파서로 읽은 상태 필터", async () => {
    const client = recordingClient();
    const { range, sources } = sourcesFor("today", client);
    await sources.metrics("members");
    const profileQueries = client.queries.filter((c) => c[0].table === "profiles").map((c) => c.slice(2).map((x) => [x.method, x.args]));
    for (const id of ["members.active", "members.suspended", "members.blocked"]) {
      const status = parseMemberListQueryState(hrefParams(id, range)).status;
      expect(status, id).toBeTruthy();
      expect(profileQueries, id).toContainEqual(opsAsCalls(adminMemberStatusFilterOps(status!)));
    }
    // 전체 회원 = 필터 없음 (목록 기본)
    expect(profileQueries).toContainEqual([]);
  });
});

describe("주문 — 주문 목록 RPC(admin_store_order_ops_page)와 같은 인자, 탭 개수", () => {
  for (const period of ["today", "yesterday", "7d", "30d"] as const) {
    it(`기간 ${period}: 링크를 주문 목록 파서로 읽은 인자 = 대시보드 RPC 인자`, async () => {
      const client = recordingClient({
        rpc: { admin_store_order_ops_page: { total: 11, tab_counts: { all: 11, in_progress: 6, completed: 4, cancel: 1, refund: 0 } } },
      });
      const { range, sources } = sourcesFor(period, client);
      const map = await sources.metrics("orders");
      const sent = client.rpcCalls.find((c) => c.name === "admin_store_order_ops_page")!.args;
      for (const [id, tab] of [
        ["orders.all", "all"],
        ["orders.in_progress", "in_progress"],
        ["orders.completed", "completed"],
        ["orders.cancel", "cancel"],
      ] as const) {
        const screen = adminOrderOpsRpcArgs(parseAdminOrderOpsQuery("list", hrefParams(id, range)), NOW);
        // 화면이 보여 주는 탭 개수(tab_counts)는 기간·탭 묶음·범위 조건이 같으면 같다
        expect(sent.p_from, id).toBe(screen.p_from);
        expect(sent.p_to, id).toBe(screen.p_to);
        expect(sent.p_tab_groups, id).toEqual(screen.p_tab_groups);
        expect(sent.p_scope_statuses, id).toEqual(screen.p_scope_statuses);
        expect(sent.p_queue_closed_statuses, id).toEqual(screen.p_queue_closed_statuses);
        expect(screen.p_tab ?? "all", id).toBe(tab);
        expect(map.get(id)?.value, id).toBe({ all: 11, in_progress: 6, completed: 4, cancel: 1 }[tab]);
      }
    });
  }
});

describe("수수료 — 수수료 원장(/api/admin/store-commission-ledger)과 같은 기간·상태", () => {
  it("순 수수료 = 링크의 period·from·to 를 원장 파서로 읽은 범위의 summary.netCommissionMinor", async () => {
    const client = recordingClient({ rpc: { store_commission_ledger_page: { summary: { net_commission_minor: 4200 } } } });
    const { range, sources } = sourcesFor("7d", client);
    const map = await sources.metrics("commission");
    const sent = client.rpcCalls.find((c) => c.name === "store_commission_ledger_page")!.args;
    const page = parseStoreCommissionLedgerQuery(hrefParams("finance.commission_net", range), NOW);
    expect(sent.p_from).toBe(page.fromIso);
    expect(sent.p_to).toBe(page.toIso);
    expect(sent.p_state).toBe(page.state);
    expect(map.get("finance.commission_net")?.value).toBe(4200);
  });
});

describe("커뮤니티 신고 — 신고 처리함과 같은 함수·같은 탭", () => {
  it("링크 status 를 처리함 탭 해석으로 읽은 탭 = 대시보드가 센 탭", async () => {
    const client = recordingClient();
    const { range, sources } = sourcesFor("today", client);
    const map = await sources.metrics("community_reports");
    const sp = hrefParams("community.report_targets_pending", range);
    const tab = resolveCommunityReportInboxTab({ status: sp.get("status"), pending: sp.get("pending") });
    expect(vi.mocked(listCommunityReportGroupsForAdmin)).toHaveBeenCalledWith(expect.objectContaining({ tab }));
    expect(map.get("community.report_targets_pending")?.value).toBe(4);
  });
});

describe("광고 — 광고 운영 화면과 같은 요약 함수", () => {
  it("화면 요약 카드와 대시보드가 같은 함수를 쓴다", () => {
    const screen = readFileSync("components/admin/ads/AdminAdvertisingWorkspace.tsx", "utf8");
    const loader = readFileSync("lib/admin/metrics/load-admin-dashboard-sources.ts", "utf8");
    expect(screen).toContain("...computeAdsWorkspaceSummaryCounts(model, mode)");
    expect(screen).toContain("computeAdsWorkspaceHeroOccupancy(model)");
    expect(loader).toContain('computeAdsWorkspaceSummaryCounts(model, "all")');
    expect(loader).toContain("computeAdsWorkspaceHeroOccupancy(model).used");
    // 화면은 `?status=` 로 같은 상태 탭을 연다
    expect(screen).toContain("ADS_WORKSPACE_STATUS_URL_PARAM");
  });
});
