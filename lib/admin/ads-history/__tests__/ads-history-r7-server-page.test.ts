/**
 * R7 — 광고 이력(/admin/advertising/history) 서버 페이지 계약 (`admin_ads_history_page`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const BOOST_ID = "11111111-1111-4111-8111-111111111111";
const POPUP_ID = "22222222-2222-4222-8222-222222222222";
const DELIVERY_ID = "33333333-3333-4333-8333-333333333333";

type Call = { kind: "rpc" | "from"; name: string; args?: unknown; ops: string[] };
const calls: Call[] = [];
let rpcData: Record<string, unknown> = {};

const tables: Record<string, Record<string, unknown>[]> = {
  point_promotion_orders: [
    {
      id: BOOST_ID,
      user_id: "u1",
      domain: "trade",
      order_status: "ended",
      created_at: "2026-10-01T00:00:00Z",
      start_at: "2026-10-01T00:00:00Z",
      end_at: "2026-10-08T00:00:00Z",
      point_cost: 100,
      target_title: "글",
    },
  ],
  platform_popup_campaigns: [
    {
      id: POPUP_ID,
      name: "팝업",
      status: "ended",
      approval_status: "approved",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
      end_at: "2026-09-30T00:00:00Z",
      owner_request_id: null,
    },
  ],
  delivery_ad_audit_logs: [
    { campaign_id: DELIVERY_ID, action: "approved", actor_type: "admin", created_at: "2026-08-01T00:00:00Z" },
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
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "order", "limit", "range", "in"]) {
        chain[op] = (...a: unknown[]) => {
          call.ops.push(`${op}:${JSON.stringify(a)}`);
          return chain;
        };
      }
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: tables[name] ?? [], error: null }).then(res);
      return chain;
    },
  } as unknown as SupabaseClient;
}

vi.mock("@/lib/stores/advertising/admin-delivery-ad-loader", () => ({
  loadAdminDeliveryAdCampaignsByIds: vi.fn(async (_sb: unknown, refs: Array<{ id: string; productKind: string }>) => ({
    items: refs
      .filter((r) => r.productKind === "banner")
      .map((r) => ({
        id: r.id,
        productKind: "banner",
        storeId: "s1",
        ownerUserId: "o1",
        inventoryKeys: ["STORES_HOME_HERO"],
        lifecycleStatus: "ENDED",
        reviewStatus: "APPROVED",
        title: "배너",
        headline: null,
        createdAt: "2026-07-01T00:00:00Z",
        submittedAt: null,
        startAt: "2026-07-01T00:00:00Z",
        endAt: "2026-07-31T00:00:00Z",
        campaignSource: "OWNER_PAID",
        sortOrder: 0,
        updatedAt: "2026-08-01T00:00:00Z",
      })),
  })),
}));

import {
  ADS_HISTORY_PAGE_RPC,
  loadAdsHistoryLedgerPage,
} from "@/lib/admin/ads-history/load-ads-history-ledger";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

beforeEach(() => {
  calls.length = 0;
  rpcData = {
    total: 812,
    rows: [
      { family: "boost", source_id: BOOST_ID, row_id: `boost:trade_boost:${BOOST_ID}`, impression_count: null },
      { family: "popup_campaign", source_id: POPUP_ID, row_id: `popup:campaign:${POPUP_ID}`, impression_count: null },
      { family: "delivery", source_id: DELIVERY_ID, row_id: `delivery:delivery_home_banner:${DELIVERY_ID}`, impression_count: 7 },
    ],
  };
});

describe("광고 이력 — R7 서버 페이지", () => {
  it("domain/status/q/limit/offset + product labels go to one RPC; rows keep RPC order; total from DB", async () => {
    const page = await loadAdsHistoryLedgerPage(fakeSb(), {
      domain: "trade",
      status: "ended",
      q: " 글 ",
      limit: 50,
      offset: 150,
    });
    const rpc = calls.find((c) => c.kind === "rpc");
    expect(rpc?.name).toBe(ADS_HISTORY_PAGE_RPC);
    expect(rpc?.args).toMatchObject({ p_domain: "trade", p_status: "ended", p_q: "글", p_limit: 50, p_offset: 150 });
    const labels = (rpc?.args as { p_product_labels: Record<string, { ko: string }> }).p_product_labels;
    expect(labels.trade_boost.ko).toBe("거래 상위노출");
    expect(page.total).toBe(812);
    expect(page.limit).toBe(50);
    expect(page.offset).toBe(150);
    expect(page.rows.map((r) => r.id)).toEqual([
      `boost:trade_boost:${BOOST_ID}`,
      `popup:campaign:${POPUP_ID}`,
      `delivery:delivery_home_banner:${DELIVERY_ID}`,
    ]);
    const delivery = page.rows[2]!;
    expect(delivery.timeline.some((e) => e.labelKo === "실제 노출 7건")).toBe(true);
    expect(delivery.lastEventAt).toBe("2026-08-01T00:00:00Z");
  });

  it("all filter → null RPC args; no fixed per-source / audit / impression caps", async () => {
    await loadAdsHistoryLedgerPage(fakeSb(), { domain: "all", status: "all", q: "", limit: 20, offset: 0 });
    expect(calls.find((c) => c.kind === "rpc")?.args).toMatchObject({ p_domain: null, p_status: null, p_q: null });
    for (const c of calls.filter((x) => x.kind === "from")) {
      expect(c.ops.some((o) => o.startsWith("limit:")), c.name).toBe(false);
    }
    const src = read("lib/admin/ads-history/load-ads-history-ledger.ts");
    expect(src).not.toMatch(/FAMILY_LIMIT|\.limit\(\s*\d+\s*\)/);
    expect(src).not.toContain("delivery_ad_impression_events");
  });

  it("API: limit default 20 / max 100 · ledger envelope keeps rows + adds total/limit/offset", () => {
    const route = read("app/api/admin/advertising/history/route.ts");
    expect(route).toMatch(/parseAdminListPage\(url\.searchParams, \{ defaultLimit: 20, maxLimit: 100 \}\)/);
    expect(route).toContain("return NextResponse.json({ ok: true, ledger });");
    const view = read("components/admin/ads/AdminAdsHistoryLedgerView.tsx");
    expect(view).toContain("AdminPagination");
    expect(view).toContain('params.set("offset", String((page - 1) * size));');
  });

  it("migration: service_role only, exact count, deterministic order, status regex = filterAdsHistoryRows", () => {
    const sql = read("supabase/migrations/20270601100200_r7_admin_ads_history_page.sql");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_ads_history_page[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_ads_history_page[\s\S]*TO service_role/);
    expect(sql).toContain("'total', (SELECT count(*) FROM filtered)");
    expect(sql).toContain('ORDER BY f.last_at DESC NULLS LAST, f.row_id COLLATE "C" DESC');
    const ts = read("lib/admin/ads-history/load-ads-history-ledger.ts");
    for (const re of [
      "ended|종료|archiv|terminat|cancelled|취소",
      "reject|반려|denied",
      "approv|승인|active|live|노출",
      "pause|제재|일시중지|sanction",
    ]) {
      expect(sql).toContain(`'${re}'`);
      expect(ts).toContain(`/${re}/`);
    }
  });
});
