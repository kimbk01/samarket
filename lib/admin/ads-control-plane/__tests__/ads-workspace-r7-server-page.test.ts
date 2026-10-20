/**
 * R7 — 광고 작업 화면 서버 페이지 계약 (`admin_ads_workspace_page`).
 * 원천 합치기·모드·종류·상태 탭·정렬·페이지·total·요약 개수 = RPC 한 번. 페이지 행만 원천별 id 로 읽는다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DELIVERY_ID = "11111111-1111-4111-8111-111111111111";
const FEED_ID = "22222222-2222-4222-8222-222222222222";
const PROMO_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";

type Call = { kind: "rpc" | "from"; name: string; args?: unknown; ops: string[] };
const calls: Call[] = [];
let rpcPayload: Record<string, unknown> = {};

const tables: Record<string, Record<string, unknown>[]> = {
  feed_ad_requests: [
    {
      id: FEED_ID,
      user_id: "u1",
      status: "pending_review",
      created_at: "2026-10-19T00:00:00Z",
      domain: "trade",
      placement: "TRADE_HOME",
    },
  ],
  point_promotion_orders: [
    {
      id: PROMO_ID,
      user_id: "u2",
      domain: "trade",
      order_status: "active",
      created_at: "2026-10-18T00:00:00Z",
      start_at: "2026-10-18T00:00:00Z",
      end_at: "2099-01-01T00:00:00Z",
      point_cost: 100,
      target_title: "글",
    },
    {
      id: ORDER_ID,
      user_id: "u3",
      domain: "community",
      order_status: "ended",
      created_at: "2025-01-01T00:00:00Z",
      start_at: "2025-01-01T00:00:00Z",
      end_at: "2025-01-08T00:00:00Z",
      point_cost: 50,
      target_title: "오래된 글",
    },
  ],
  feed_ad_request_creatives: [],
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
        return Promise.resolve({ data: rows, error: null, count: 0 }).then(res);
      };
      return chain;
    },
  };
}

vi.mock("@/lib/admin/ads-exposure/popup-runtime-display", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  computePopupWinnerOccupancy: vi.fn(async () => ({ winnerIds: new Set<string>(), occupants: [] })),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-operations-action-queue", () => ({
  listDeliveryAdAdminActionQueue: vi.fn(async () => ({ ok: true, items: [], total: 7 })),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-loader", () => ({
  loadAdminDeliveryAdCampaignsByIds: vi.fn(async (_sb: unknown, refs: Array<{ id: string; productKind: string }>) => ({
    items: refs
      .filter((r) => r.id === DELIVERY_ID && r.productKind === "banner")
      .map(() => ({
        id: DELIVERY_ID,
        productKind: "banner",
        storeId: "s1",
        storeName: "매장",
        storeThumbnailUrl: null,
        storePrimarySlug: null,
        storeSubSlug: null,
        ownerUserId: "o1",
        ownerDisplayName: null,
        inventoryKeys: ["STORES_HOME_HERO"],
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        reviewNotes: null,
        title: "배너",
        headline: null,
        imageUrl: "https://x/a.png",
        ctaHref: "/stores",
        storeSlug: null,
        creativeId: null,
        startAt: "2026-10-01T00:00:00Z",
        endAt: "2099-01-01T00:00:00Z",
        pricingModel: null,
        submittedAt: null,
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-20T00:00:00Z",
        listBucket: "active",
        scheduleHint: "in_window",
        campaignSource: "OWNER_PAID",
        sortOrder: 0,
      })),
  })),
  loadAdminDeliveryAdCampaignsByLifecycles: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/lib/ads/feed-ad-campaigns-db", () => ({
  listFeedAdCampaignsByIdsForAdmin: vi.fn(async () => []),
}));
vi.mock("@/lib/platform-popup/admin-campaign-loader", () => ({
  listPlatformPopupAdminCampaignsByIds: vi.fn(async () => ({ ok: true, items: [] })),
}));

import {
  ADS_WORKSPACE_PAGE_RPC,
  loadAdsControlPlane,
} from "@/lib/admin/ads-control-plane/load-ads-control-plane";
import { computeAdsWorkspaceSummaryCounts } from "@/lib/admin/advertising-workspace/workspace-summary";
import type { SupabaseClient } from "@supabase/supabase-js";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

beforeEach(() => {
  calls.length = 0;
  rpcPayload = {
    total: 345,
    rows: [
      { family: "delivery", source_id: DELIVERY_ID, item_id: `delivery:${DELIVERY_ID}` },
      { family: "feed_request", source_id: FEED_ID, item_id: `feed:${FEED_ID}` },
      { family: "promote", source_id: PROMO_ID, item_id: `trade_promo:${PROMO_ID}` },
    ],
    summary_counts: {
      all: { pending: 131, live: 180, waiting: 12, incomplete: 90, scheduled: 4, ended: 187 },
      applications: { pending: 40 },
    },
    queue_counts: { feed_pending: 3, trade_pending: 2, community_pending: 0 },
    popup_surfaces: [],
  };
});

describe("광고 작업 화면 — R7 서버 페이지", () => {
  it("passes mode/status/family/limit/offset to one RPC and keeps the RPC order", async () => {
    const model = await loadAdsControlPlane(fakeSb() as unknown as SupabaseClient, {
      page: { mode: "operations", status: "live", family: "banner", limit: 50, offset: 100 },
    });
    const rpc = calls.find((c) => c.kind === "rpc" && c.name === ADS_WORKSPACE_PAGE_RPC);
    expect(rpc?.args).toMatchObject({
      p_mode: "operations",
      p_status: "live",
      p_family: "banner",
      p_store_id: null,
      p_limit: 50,
      p_offset: 100,
      p_pending_asset: "delivery-ads/pending/admin-production",
    });
    expect(model.applications.map((a) => a.id)).toEqual([
      `delivery:${DELIVERY_ID}`,
      `feed:${FEED_ID}`,
      `trade_promo:${PROMO_ID}`,
    ]);
    expect(model.page).toEqual({
      mode: "operations",
      status: "live",
      family: "banner",
      total: 345,
      limit: 50,
      offset: 100,
    });
    expect(model.queues.delivery.count).toBe(7);
    expect(model.queues.feed.count).toBe(3);
    expect(model.queues.tradePromote.count).toBe(2);
  });

  it("reads only page ids (in) — no fixed per-source limit", async () => {
    await loadAdsControlPlane(fakeSb() as unknown as SupabaseClient, { page: { limit: 20, offset: 0 } });
    const reads = calls.filter((c) => c.kind === "from" && c.name !== "platform_popup_owner_requests");
    for (const c of reads) {
      expect(c.ops.some((o) => o.startsWith("limit:")), c.name).toBe(false);
      expect(c.ops.some((o) => o.startsWith("in:")), c.name).toBe(true);
    }
    const src = read("lib/admin/ads-control-plane/load-ads-control-plane.ts");
    expect(src).not.toMatch(/FAMILY_LIMIT/);
    expect(src).not.toMatch(/\.limit\(\s*\d+\s*\)/);
  });

  it("summary cards = server summaryCounts (same SQL as the list) for every mode", async () => {
    const model = await loadAdsControlPlane(fakeSb() as unknown as SupabaseClient);
    expect(computeAdsWorkspaceSummaryCounts(model, "all")).toEqual({
      pending: 131,
      live: 180,
      waiting: 12,
      incomplete: 90,
      scheduled: 4,
    });
    expect(computeAdsWorkspaceSummaryCounts(model, "applications")).toEqual({
      pending: 40,
      live: 0,
      waiting: 0,
      incomplete: 0,
      scheduled: 0,
    });
    // 페이지 조건 없음(대시보드) = 기본 전체·첫 페이지
    expect(calls.find((c) => c.kind === "rpc")?.args).toMatchObject({
      p_mode: "all",
      p_status: null,
      p_family: null,
      p_limit: 20,
      p_offset: 0,
    });
  });

  it("deep-linked boost order outside the page is pinned to the top", async () => {
    const model = await loadAdsControlPlane(fakeSb() as unknown as SupabaseClient, {
      ensureBoostOrderId: ORDER_ID,
      page: { mode: "boosts", limit: 20, offset: 0 },
    });
    expect(model.applications[0]?.id).toBe(`community_promo:${ORDER_ID}`);
  });

  it("store scope goes to the RPC (no in-memory filter)", async () => {
    await loadAdsControlPlane(fakeSb() as unknown as SupabaseClient, {
      storeId: "55555555-5555-4555-8555-555555555555",
    });
    expect(calls.find((c) => c.kind === "rpc")?.args).toMatchObject({
      p_store_id: "55555555-5555-4555-8555-555555555555",
    });
  });

  it("API: limit max 100, mode/status/family whitelists, same response envelope", () => {
    const route = read("app/api/admin/ads-control-plane/route.ts");
    expect(route).toMatch(/parseAdminListPage\(sp, \{ defaultLimit: 20, maxLimit: ADS_WORKSPACE_PAGE_MAX_LIMIT \}\)/);
    expect(route).toContain('NextResponse.json({ ok: true, plane: model })');
    const ui = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(ui).toContain("AdminPagination");
    expect(ui).not.toContain("filterShellRowsByTab");
    expect(ui).not.toContain("filterRowsByMode(");
  });

  it("migration: service_role only, deterministic order, exact count", () => {
    const sql = read("supabase/migrations/20270601100300_r7_admin_ads_workspace_page.sql");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_ads_workspace_page[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_ads_workspace_page[\s\S]*TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_ads_workspace_rows/);
    expect(sql).toContain("'total', (SELECT count(*) FROM filtered)");
    expect(sql).toContain("ORDER BY f.at DESC NULLS LAST, f.family_ord, f.item_id COLLATE \"C\" DESC");
  });
});
