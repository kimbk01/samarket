/**
 * R7 후속 (ads) — 팝업 오너 신청 목록 포함 · 예약(scheduled) 상태 탭.
 *
 * 1. 팝업 오너 신청(`platform_popup_owner_requests`)은 운영 실제 열로 읽어 광고 작업·광고 이력 목록에 포함된다
 *    (옛 로더는 운영에 없는 `title` 열을 조회해 항상 빠졌다).
 * 2. 피드 신청·피드 캠페인·상위노출·팝업 오너 신청의 운영 상태 scheduled = 「예약」 탭 (「노출 중」 아님).
 *    TS(`resolveShellStatusTab` ← `opsStatus`) 와 SQL(`admin_ads_workspace_rows` status_tab) 이 같은 정의임을 고정한다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";
import type { AdsActionItem } from "@/lib/admin/ads-control-plane/types";
import type { AdsOpsStatus } from "@/lib/admin/ads-exposure/ops-status";

const REQ_ID = "77777777-7777-4777-8777-777777777777";
const STORE_ID = "88888888-8888-4888-8888-888888888888";
const MIGRATION = "supabase/migrations/20270601180000_r7_ads_popup_owner_requests_scheduled_tab.sql";

type Call = { kind: "rpc" | "from"; name: string; args?: unknown; ops: string[] };
const calls: Call[] = [];
let rpcPayload: Record<string, unknown> = {};

const tables: Record<string, Record<string, unknown>[]> = {
  platform_popup_owner_requests: [
    {
      id: REQ_ID,
      store_id: STORE_ID,
      owner_user_id: "99999999-9999-4999-8999-999999999999",
      request_status: "rejected",
      payment_status: "refunded",
      price_minor: 20000,
      currency: "BUSINESS_CASH",
      requested_start_at: "2026-09-03T13:26:36Z",
      requested_end_at: "2026-09-03T15:27:36Z",
      created_at: "2026-09-03T13:27:36Z",
    },
  ],
  stores: [{ id: STORE_ID, store_name: "나의 매장" }],
};

function fakeSb() {
  return {
    rpc: (name: string, args: unknown) => {
      calls.push({ kind: "rpc", name, args, ops: [] });
      return Promise.resolve({ data: rpcPayload, error: null });
    },
    from: (name: string) => {
      const call: Call = { kind: "from", name, ops: [] };
      calls.push(call);
      let ids: string[] | null = null;
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "order", "limit", "range"]) {
        chain[op] = (...a: unknown[]) => {
          call.ops.push(`${op}:${JSON.stringify(a)}`);
          return chain;
        };
      }
      chain.in = (col: string, vals: unknown[]) => {
        call.ops.push(`in:${col}`);
        if (col === "id") ids = vals.map(String);
        return chain;
      };
      chain.then = (res: (v: unknown) => unknown) => {
        const rows = (tables[name] ?? []).filter((r) => !ids || ids.includes(String(r.id)));
        return Promise.resolve({ data: rows, error: null, count: 2 }).then(res);
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

vi.mock("@/lib/admin/ads-exposure/popup-runtime-display", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  computePopupWinnerOccupancy: vi.fn(async () => ({ winnerIds: new Set<string>(), occupants: [] })),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-operations-action-queue", () => ({
  listDeliveryAdAdminActionQueue: vi.fn(async () => ({ ok: true, items: [], total: 0 })),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-loader", () => ({
  loadAdminDeliveryAdCampaignsByIds: vi.fn(async () => ({ items: [] })),
  loadAdminDeliveryAdCampaignsByLifecycles: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/lib/ads/feed-ad-campaigns-db", () => ({
  listFeedAdCampaignsByIdsForAdmin: vi.fn(async () => []),
}));
vi.mock("@/lib/platform-popup/admin-campaign-loader", () => ({
  listPlatformPopupAdminCampaignsByIds: vi.fn(async () => ({ ok: true, items: [] })),
}));

import { loadAdsControlPlane } from "@/lib/admin/ads-control-plane/load-ads-control-plane";
import {
  POPUP_REQUEST_SELECT,
  popupRequestOpsStatus,
  projectFeedCampaignToActionItem,
  projectFeedRequestToActionItem,
  projectPopupRequestToActionItem,
  projectPromoteOrderToActionItem,
} from "@/lib/admin/ads-control-plane/project-family-rows";
import { resolveShellStatusTab, toAdsShellListRow } from "@/lib/admin/ads-exposure/shell-row";
import { loadAdsHistoryLedgerPage } from "@/lib/admin/ads-history/load-ads-history-ledger";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const NOW = "2026-10-20T00:00:00.000Z";

beforeEach(() => {
  calls.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("예약(scheduled) = 「예약」 탭 — 노출 중으로 세지 않는다", () => {
  const future = { start: "2026-10-22T00:00:00Z", end: "2026-10-29T00:00:00Z" };

  it("feed request / feed campaign / promote / popup request scheduled → scheduled tab", () => {
    const items: AdsActionItem[] = [
      projectFeedRequestToActionItem({
        id: "f1",
        user_id: "u1",
        status: "approved",
        start_at: future.start,
        end_at: future.end,
        created_at: NOW,
        domain: "trade",
      }),
      projectFeedCampaignToActionItem({
        id: "c1",
        name: "camp",
        status: "active",
        startAt: future.start,
        endAt: future.end,
        placement: "TRADE_HOME",
      } as unknown as FeedAdCampaignView),
      projectPromoteOrderToActionItem({
        id: "p1",
        user_id: "u2",
        domain: "trade",
        order_status: "active",
        start_at: future.start,
        end_at: future.end,
        created_at: NOW,
        point_cost: 100,
        target_title: "글",
      }),
      projectPopupRequestToActionItem({
        id: "r1",
        store_id: STORE_ID,
        owner_user_id: "o1",
        request_status: "approved",
        requested_start_at: future.start,
        requested_end_at: future.end,
        created_at: NOW,
      }),
    ];
    for (const item of items) {
      expect(item.opsStatus, item.id).toBe("scheduled");
      // 표시 문구에는 여전히 「노출」이 들어 있다 — 문구를 다시 읽지 않아야 예약으로 남는다.
      expect(`${item.status} ${item.exposureLabel}`).toContain("노출");
      expect(resolveShellStatusTab(item), item.id).toBe("scheduled");
      expect(toAdsShellListRow(item, true).statusTab, item.id).toBe("scheduled");
    }
  });

  it("live window stays live; ended/rejected/draft keep their tabs", () => {
    const live = projectFeedRequestToActionItem({
      id: "f2",
      status: "approved",
      start_at: "2026-10-19T00:00:00Z",
      end_at: future.end,
      created_at: NOW,
    });
    expect(resolveShellStatusTab(live)).toBe("live");
    const draft = projectPopupRequestToActionItem({ id: "r2", request_status: "draft", created_at: NOW });
    expect(resolveShellStatusTab(draft)).toBe("incomplete");
  });

  it("SQL status_tab mapping = TS opsToShellTab for every ops (feed·campaign·promote·popup request)", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toContain("WHEN 'scheduled' THEN 'live'");
    const all: AdsOpsStatus[] = ["pending", "scheduled", "live", "paused", "ended", "rejected", "draft", "archived"];
    for (const alias of ["f", "c", "o", "q"]) {
      const m = sql.match(new RegExp(`CASE ${alias}\\.ops ([\\s\\S]*?) END`));
      expect(m, alias).toBeTruthy();
      const pairs = new Map<string, string>();
      for (const w of m![1]!.matchAll(/WHEN '(\w+)' THEN '(\w+)'/g)) pairs.set(w[1]!, w[2]!);
      const elseTab = /ELSE '(\w+)'/.exec(m![1]!)?.[1];
      for (const ops of all) {
        const sqlTab = pairs.get(ops) ?? elseTab;
        const tsTab = resolveShellStatusTab({ ...projectPopupRequestToActionItem({ id: "x" }), opsStatus: ops });
        expect(sqlTab, `${alias}:${ops}`).toBe(tsTab);
      }
    }
  });
});

describe("팝업 오너 신청 운영 상태 — TS = SQL (신청 상태 + 신청 기간)", () => {
  it("cases (same table as the local SQL verification)", () => {
    const cases: Array<[string, string | null, string | null, AdsOpsStatus]> = [
      ["draft", null, null, "draft"],
      ["submitted", null, null, "pending"],
      ["under_review", null, null, "pending"],
      ["revision_required", null, null, "ended"],
      ["approved", "2026-10-22T00:00:00Z", "2026-10-25T00:00:00Z", "scheduled"],
      ["approved", "2026-10-19T00:00:00Z", "2026-10-25T00:00:00Z", "live"],
      ["approved", "2026-09-05T00:00:00Z", "2026-09-07T00:00:00Z", "ended"],
      ["approved", null, null, "live"],
      ["rejected", null, null, "rejected"],
      ["cancelled", null, null, "ended"],
    ];
    for (const [st, s, e, want] of cases) {
      expect(
        popupRequestOpsStatus({ request_status: st, requested_start_at: s, requested_end_at: e }),
        `${st} ${s} ${e}`
      ).toBe(want);
    }
    const sql = read(MIGRATION);
    expect(sql).toContain(
      "public.admin_ads_project_ops(r.request_status, r.requested_start_at, r.requested_end_at, false, n.t) AS ops"
    );
  });

  it("select uses only real columns (no title)", () => {
    expect(POPUP_REQUEST_SELECT.split(",").map((c) => c.trim())).toEqual([
      "id",
      "store_id",
      "owner_user_id",
      "request_status",
      "payment_status",
      "requested_start_at",
      "requested_end_at",
      "created_at",
    ]);
    for (const src of [
      read("lib/admin/ads-control-plane/load-ads-control-plane.ts"),
      read("lib/admin/ads-history/load-ads-history-ledger.ts"),
      read(MIGRATION),
    ]) {
      expect(src).not.toMatch(/owner_requests[^\n]*\btitle\b/);
      expect(src).not.toMatch(/\br\.title\b/);
    }
  });
});

describe("광고 작업 목록 — 팝업 오너 신청 행 hydrate", () => {
  it("RPC popup_request ref → popup:<id> row (store name title, rejected tab); queue error not swallowed", async () => {
    rpcPayload = {
      total: 1,
      rows: [{ family: "popup_request", source_id: REQ_ID, item_id: `popup:${REQ_ID}` }],
      summary_counts: { all: { rejected: 1 } },
      queue_counts: {},
      popup_surfaces: [],
    };
    const model = await loadAdsControlPlane(fakeSb(), { page: { mode: "all", limit: 20, offset: 0 } });
    expect(model.applications.map((a) => a.id)).toEqual([`popup:${REQ_ID}`]);
    const row = model.applications[0]!;
    expect(row.title).toBe("나의 매장");
    expect(row.storeId).toBe(STORE_ID);
    expect(resolveShellStatusTab(row)).toBe("rejected");
    const reqRead = calls.find(
      (c) => c.kind === "from" && c.name === "platform_popup_owner_requests" && c.ops.includes("in:id")
    );
    expect(reqRead?.ops[0]).toBe(`select:${JSON.stringify([POPUP_REQUEST_SELECT])}`);
    expect(model.queues.popup.count).toBe(2);
    const src = read("lib/admin/ads-control-plane/load-ads-control-plane.ts");
    expect(src).toContain("const popupOwnerUnavailable = !!popupOwnerPending.error;");
  });
});

describe("광고 이력 — 팝업 오너 신청 행 hydrate", () => {
  it("RPC popup_request ref → popup:owner_request:<id> legacy row (store name title, refunded)", async () => {
    rpcPayload = {
      total: 1,
      rows: [{ family: "popup_request", source_id: REQ_ID, row_id: `popup:owner_request:${REQ_ID}`, impression_count: null }],
    };
    const page = await loadAdsHistoryLedgerPage(fakeSb(), { limit: 20, offset: 0 });
    expect(page.total).toBe(1);
    expect(page.rows.map((r) => r.id)).toEqual([`popup:owner_request:${REQ_ID}`]);
    const row = page.rows[0]!;
    expect(row.campaignTitle).toBe("나의 매장");
    expect(row.legacy).toBe(true);
    expect(row.paymentState).toBe("refunded");
    expect(row.finalStatusKo).toBe("rejected");
    // SQL 이력 요약·노출 위치와 같은 문구 (검색·상태 필터 대상)
    expect(row.lifecycleSummaryKo).toBe("레거시 오너 신청 → 환불 → rejected");
    expect(row.placementLabelKo).toBe("Popup (legacy owner)");
    const sql = read(MIGRATION);
    expect(sql).toContain("'레거시 오너 신청 → '");
    expect(sql).toContain("'Popup (legacy owner)'::text AS placement_override");
    expect(sql).toContain("'popup:owner_request:' || q.id::text AS row_id");
  });
});
