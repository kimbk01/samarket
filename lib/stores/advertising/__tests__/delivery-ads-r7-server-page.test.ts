/**
 * R7 — 배달 광고 관리(/admin/delivery-ads/manage) 서버 페이지 계약.
 * 목록 = `admin_delivery_ad_campaigns_page` · 처리 Case = `admin_delivery_ad_action_queue_page` (limit/offset + total).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_DELIVERY_AD_CAMPAIGNS_PAGE_RPC,
  loadAdminDeliveryAdCampaignPage,
} from "@/lib/stores/advertising/admin-delivery-ad-loader";
import {
  DELIVERY_AD_ADMIN_ACTION_QUEUE_RPC,
  listDeliveryAdAdminActionQueue,
} from "@/lib/stores/advertising/delivery-ad-operations-action-queue";

const SP_ID = "11111111-1111-4111-8111-111111111111";
const BN_ID = "22222222-2222-4222-8222-222222222222";

type Call = { kind: "rpc" | "from"; name: string; args?: unknown; ops: string[] };
const calls: Call[] = [];
let rpcData: Record<string, unknown> = {};

const tables: Record<string, Record<string, unknown>[]> = {
  store_paid_ad_campaigns: [
    {
      id: SP_ID,
      store_id: "s1",
      title: "홍보",
      headline: "h",
      lifecycle_status: "SUBMITTED",
      review_status: "SUBMITTED",
      start_at: "2026-10-01T00:00:00Z",
      end_at: "2026-11-01T00:00:00Z",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-19T00:00:00Z",
      campaign_source: "OWNER_PAID",
    },
  ],
  store_banner_ad_campaigns: [
    {
      id: BN_ID,
      store_id: "s1",
      title: "배너",
      subtitle: null,
      image_url: "https://x/b.png",
      cta_href: "/stores",
      sort_order: 0,
      lifecycle_status: "ACTIVE",
      review_status: "APPROVED",
      start_at: "2026-10-01T00:00:00Z",
      end_at: "2026-11-01T00:00:00Z",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
      campaign_source: "OWNER_PAID",
    },
  ],
};

function fakeSb() {
  return {
    rpc: (name: string, args: unknown) => {
      calls.push({ kind: "rpc", name, args, ops: [] });
      return Promise.resolve({ data: rpcData, error: null });
    },
    from: (name: string) => {
      const call: Call = { kind: "from", name, ops: [] };
      calls.push(call);
      let ids: string[] | null = null;
      let eqId: string | null = null;
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "order", "limit", "range"]) {
        chain[op] = (...a: unknown[]) => {
          call.ops.push(`${op}:${JSON.stringify(a)}`);
          return chain;
        };
      }
      chain.eq = (col: string, v: unknown) => {
        call.ops.push(`eq:${col}`);
        if (col === "id") eqId = String(v);
        return chain;
      };
      chain.in = (col: string, vals: unknown[]) => {
        call.ops.push(`in:${col}`);
        if (col === "id") ids = vals.map(String);
        return chain;
      };
      const rows = () => (tables[name] ?? []).filter((r) => (!ids || ids.includes(String(r.id))) && (!eqId || String(r.id) === eqId));
      chain.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res);
      return chain;
    },
  } as unknown as SupabaseClient;
}

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

beforeEach(() => {
  calls.length = 0;
});

describe("배달 광고 목록 — R7 서버 페이지", () => {
  it("view/product/filters + limit/offset go to one RPC; rows keep RPC order; total/summary/today from DB", async () => {
    rpcData = {
      total: 312,
      summary: { total: 312, review: 40, active: 22, held: 9, ended: 120 },
      policy_counts: null,
      today_counts: { new: 4, resubmit: 0, needs_production: 6, pending_review: 88, pending_payment: 30, scheduled: 40, active: 20, paused: 42 },
      rows: [
        { product_kind: "banner", id: BN_ID },
        { product_kind: "store_sponsored", id: SP_ID },
      ],
    };
    const page = await loadAdminDeliveryAdCampaignPage(fakeSb(), {
      product: "all",
      view: "actionable",
      inventoryKey: "STORES_CATEGORY_FEED",
      primarySlug: "food",
      limit: 50,
      offset: 50,
    });
    const rpc = calls.find((c) => c.kind === "rpc");
    expect(rpc?.name).toBe(ADMIN_DELIVERY_AD_CAMPAIGNS_PAGE_RPC);
    expect(rpc?.args).toMatchObject({
      p_product: null,
      p_view: "actionable",
      p_inventory_key: "STORES_CATEGORY_FEED",
      p_primary_slug: "food",
      p_limit: 50,
      p_offset: 50,
      p_pending_asset: "delivery-ads/pending/admin-production",
    });
    expect(page.total).toBe(312);
    expect(page.summary).toEqual({ total: 312, review: 40, active: 22, held: 9, ended: 120 });
    expect(page.todayCounts?.pending_review).toBe(88);
    expect(page.items.map((i) => `${i.productKind}:${i.id}`)).toEqual([`banner:${BN_ID}`, `store_sponsored:${SP_ID}`]);
    // 캠페인 표는 페이지 id 로만 읽는다 (limit 없음)
    for (const c of calls.filter((x) => x.name === "store_paid_ad_campaigns" || x.name === "store_banner_ad_campaigns")) {
      expect(c.ops).toContain("in:id");
      expect(c.ops.some((o) => o.startsWith("limit:"))).toBe(false);
    }
  });

  it("API: view/offset → paged response (total·limit·offset·todayCounts); without them → legacy response", () => {
    const route = read("app/api/admin/delivery-ads/route.ts");
    expect(route).toContain('if (sp.has("view") || sp.has("offset"))');
    expect(route).toMatch(/parseAdminListPage\(sp, \{ defaultLimit: 20, maxLimit: 100 \}\)/);
    expect(route).toContain("todayCounts: result.todayCounts");
    // 다른 호출자(배치 정책 패널 등) 호환 — 기존 경로 유지
    expect(route).toContain("loadAdminDeliveryAdCampaignList(sb, {");
    const hub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
    expect(hub).not.toContain("limit=500");
    expect(hub).not.toContain("action-queue?limit=100");
    expect(hub).toContain("AdminPagination");
    expect(hub).toContain("view: hubView");
  });

  it("migration: service_role only, exact count, deterministic order", () => {
    const sql = read("supabase/migrations/20270601100100_r7_admin_delivery_ad_campaigns_page.sql");
    for (const fn of [
      "admin_delivery_ad_campaign_index",
      "admin_delivery_ad_action_queue_rows",
      "admin_delivery_ad_action_queue_page",
      "admin_delivery_ad_campaigns_page",
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]*?TO service_role`));
    }
    expect(sql).toContain("ORDER BY f.updated_at DESC, (f.product_kind = 'banner') ASC, f.id DESC");
    expect(sql).toContain("'total', (SELECT count(*) FROM filtered)");
  });
});

describe("처리 Case — R7 서버 페이지", () => {
  it("limit/offset → RPC; total = RPC total (funding filter in DB, not after the page cut)", async () => {
    rpcData = {
      total: 130,
      rows: [
        {
          case_id: "c1",
          product_kind: "store_sponsored",
          campaign_id: SP_ID,
          owner_user_id: "o1",
          updated_at: "2026-10-20T00:00:00Z",
          funding_status: "FUNDED",
        },
      ],
    };
    const res = await listDeliveryAdAdminActionQueue(fakeSb(), { limit: 50, offset: 100 });
    expect(calls.find((c) => c.kind === "rpc")).toMatchObject({
      name: DELIVERY_AD_ADMIN_ACTION_QUEUE_RPC,
      args: { p_limit: 50, p_offset: 100, p_product_kind: null },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.total).toBe(130);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ caseId: "c1", fundingStatus: "FUNDED", campaignLifecycle: "SUBMITTED" });
    // 처리 Case 표를 limit 으로 자르지 않는다
    expect(calls.some((c) => c.name === "delivery_ad_operations_cases")).toBe(false);
  });

  it("limit is clamped to 100", async () => {
    rpcData = { total: 0, rows: [] };
    await listDeliveryAdAdminActionQueue(fakeSb(), { limit: 5000 });
    expect(calls.find((c) => c.kind === "rpc")?.args).toMatchObject({ p_limit: 100, p_offset: 0 });
  });

  it("panel pages through the exact total", () => {
    const panel = read("components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx");
    expect(panel).toContain("AdminPagination");
    expect(panel).toContain("offset: String((page - 1) * size)");
    const route = read("app/api/admin/delivery-ads/action-queue/route.ts");
    expect(route).toContain("listDeliveryAdAdminActionQueue(sb, { productKind, limit, offset })");
  });
});
