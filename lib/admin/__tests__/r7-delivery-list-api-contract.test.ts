/**
 * R7 목록 표준 — 배달·매장 묶음 API 계약 (가짜 DB).
 * - `limit`(20/50/100, 그 외 20)·`offset` → PostgREST `.range(offset, offset+limit-1)` + `count: "exact"` → 응답 `total`.
 * - 고정 상한(400·300·200·120) 은 서버 페이지 모드에서 쓰지 않는다 (`.limit(N)` 호출 없음).
 * - 다른 호출자가 있는 API 는 `limit`/`offset` 이 없을 때 예전 응답(상한 포함) 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; op: string; args: unknown[] };
type TableData = { rows: Record<string, unknown>[]; count?: number };

const h = vi.hoisted(() => ({
  sb: null as unknown,
}));

function fakeSb(tables: Record<string, TableData>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const state: { countExact: boolean; range: [number, number] | null; limit: number | null } = {
      countExact: false,
      range: null,
      limit: null,
    };
    const builder: Record<string, unknown> = {};
    const chain =
      (op: string) =>
      (...args: unknown[]) => {
        calls.push({ table, op, args });
        if (op === "select") state.countExact = (args[1] as { count?: string } | undefined)?.count === "exact";
        if (op === "range") state.range = [Number(args[0]), Number(args[1])];
        if (op === "limit") state.limit = Number(args[0]);
        return builder;
      };
    for (const op of ["select", "order", "range", "limit", "eq", "in", "is", "not", "or", "ilike", "gt", "gte", "lt", "neq"]) {
      builder[op] = chain(op);
    }
    builder.maybeSingle = () => {
      calls.push({ table, op: "maybeSingle", args: [] });
      return Promise.resolve({ data: (tables[table] ?? { rows: [] }).rows[0] ?? null, error: null });
    };
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const t = tables[table] ?? { rows: [] };
      let data = t.rows;
      if (state.range) data = data.slice(state.range[0], state.range[1] + 1);
      else if (state.limit != null) data = data.slice(0, state.limit);
      const count = state.countExact ? (t.count ?? t.rows.length) : null;
      return Promise.resolve({ data, error: null, count }).then(resolve, reject);
    };
    return builder;
  };
  return { sb: { from, rpc: async () => ({ data: null, error: null }) }, calls };
}

vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => h.sb }));
vi.mock("@/lib/admin-business/load-store-hub-summary", () => ({ loadActorLabels: async () => new Map() }));
vi.mock("@/lib/admin/require-admin-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAdminApiUser: async () => ({ ok: true, userId: "11111111-1111-1111-1111-111111111111" }),
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => h.sb }));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({ appendAdminRouteAudit: vi.fn() }));
vi.mock("@/lib/stores/store-discovery-campaign-writer", () => ({
  createStoreDiscoveryCampaignAdmin: vi.fn(),
  updateStoreDiscoveryCampaignAdmin: vi.fn(),
}));
vi.mock("@/lib/admin/require-admin-permission", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" }, sb: h.sb }),
  requireAdminApiActor: async () => ({ ok: true, actor: { userId: "admin-1", isSuperAdmin: true } }),
}));

import {
  deliveryListRange,
  parseDeliveryListPage,
  parseDeliveryListPageIfRequested,
} from "@/lib/admin/delivery-list/delivery-list-page";
import { GET as productsGET } from "@/app/api/admin/store-products/route";
import { GET as reportsGET } from "@/app/api/admin/store-reports/route";
import { GET as cashChargesGET } from "@/app/api/admin/business-cash-charges/route";
import { GET as reviewsGET } from "@/app/api/admin/store-reviews/route";
import { GET as inquiriesGET } from "@/app/api/admin/store-inquiries/route";
import { GET as paymentEventsGET } from "@/app/api/admin/store-payment-events/route";
import { GET as alertsGET } from "@/app/api/admin/delivery-operation-alerts/route";
import { GET as giftTrackingGET } from "@/app/api/admin/gift-certificates/tracking/route";
import { GET as discoveryCampaignsGET } from "@/app/api/admin/store-discovery/campaigns/route";
import {
  adminOrderAuditQueryToParams,
  parseAdminOrderAuditQuery,
} from "@/lib/admin/store-orders/load-admin-store-order-audit";
import { NextRequest } from "next/server";

const rows = (n: number, make: (i: number) => Record<string, unknown>) => Array.from({ length: n }, (_, i) => make(i));
const req = (url: string) => new NextRequest(new URL(url, "https://x.test"));
const opsOf = (calls: Call[], table: string, op: string) => calls.filter((c) => c.table === table && c.op === op);

beforeEach(() => {
  h.sb = null;
});

describe("delivery-list-page 파서", () => {
  it("limit 은 20/50/100 만, 그 외 20 · offset 은 0 이상 (상한 100,000)", () => {
    const sp = (s: string) => new URLSearchParams(s);
    expect(parseDeliveryListPage(sp("limit=50&offset=100"))).toEqual({ limit: 50, offset: 100 });
    expect(parseDeliveryListPage(sp("limit=200"))).toEqual({ limit: 20, offset: 0 });
    expect(parseDeliveryListPage(sp("limit=abc&offset=-5"))).toEqual({ limit: 20, offset: 0 });
    expect(parseDeliveryListPage(sp("limit=100&offset=999999999")).offset).toBe(100_000);
    expect(parseDeliveryListPageIfRequested(sp(""))).toBeNull();
    expect(parseDeliveryListPageIfRequested(sp("offset=20"))).toEqual({ limit: 20, offset: 20 });
    expect(deliveryListRange({ limit: 50, offset: 100 })).toEqual([100, 149]);
  });
});

describe("store-products", () => {
  it("limit/offset → range + total(count) · 400 상한 없음", async () => {
    const db = fakeSb({ store_products: { rows: rows(30, (i) => ({ id: `p${i}`, store_id: "s1" })), count: 1234 } });
    h.sb = db.sb;
    const res = await productsGET(new Request("https://x.test/api/admin/store-products?limit=20&offset=20&status=active&q=치킨"));
    const json = (await res.json()) as { ok: boolean; total: number; limit: number; offset: number; products: unknown[] };
    expect(json).toMatchObject({ ok: true, total: 1234, limit: 20, offset: 20 });
    expect(json.products).toHaveLength(10);
    expect(opsOf(db.calls, "store_products", "range")[0].args).toEqual([20, 39]);
    expect(opsOf(db.calls, "store_products", "limit")).toHaveLength(0);
    expect(opsOf(db.calls, "store_products", "eq").map((c) => c.args)).toContainEqual(["product_status", "active"]);
    expect(opsOf(db.calls, "store_products", "ilike")[0].args).toEqual(["title", "%치킨%"]);
  });
  it("파라미터 없으면 예전 응답 (최근 400건, total 없음)", async () => {
    const db = fakeSb({ store_products: { rows: [] } });
    h.sb = db.sb;
    const json = (await (await productsGET(new Request("https://x.test/api/admin/store-products"))).json()) as Record<string, unknown>;
    expect(json.total).toBeUndefined();
    expect(opsOf(db.calls, "store_products", "limit")[0].args).toEqual([400]);
  });
});

describe("store-reports · store-reviews · store-inquiries", () => {
  it.each([
    ["store_reports", reportsGET, "reports", "/api/admin/store-reports", 400],
    ["store_reviews", reviewsGET, "reviews", "/api/admin/store-reviews", 300],
    ["store_inquiries", inquiriesGET, "inquiries", "/api/admin/store-inquiries", 300],
  ] as const)("%s: limit/offset → range + total, 없으면 예전 상한", async (table, GET, key, path, legacyCap) => {
    const db = fakeSb({ [table]: { rows: rows(120, (i) => ({ id: `${table}-${i}`, store_id: "s1" })), count: 777 } });
    h.sb = db.sb;
    const call = (url: string) => (GET as (r: never) => Promise<Response>)(req(url) as never);
    const paged = (await (await call(`${path}?limit=100&offset=100`)).json()) as Record<string, unknown>;
    expect(paged).toMatchObject({ ok: true, total: 777, limit: 100, offset: 100 });
    expect((paged[key] as unknown[]).length).toBe(20);
    expect(opsOf(db.calls, table, "range")[0].args).toEqual([100, 199]);
    expect(opsOf(db.calls, table, "limit")).toHaveLength(0);

    db.calls.length = 0;
    const legacy = (await (await call(path)).json()) as Record<string, unknown>;
    expect(legacy.total).toBeUndefined();
    expect(opsOf(db.calls, table, "limit")[0].args).toEqual([legacyCap]);
  });
});

describe("store-reports 딥링크 강조 위치 (focus_position)", () => {
  const FOCUS = "5d0f6c1e-2222-4333-8444-555566667777";
  it("강조 신고 앞의 건수 = 같은 정렬(최신순·id)·같은 매장 필터 count — 화면이 그 쪽으로 이동", async () => {
    const db = fakeSb({ store_reports: { rows: [{ id: FOCUS, created_at: "2026-10-01T00:00:00Z", store_id: "s1" }], count: 57 } });
    h.sb = db.sb;
    const json = (await (await reportsGET(req(`/api/admin/store-reports?focus_position=${FOCUS}&store_id=s1`) as never)).json()) as {
      ok: boolean;
      position: number | null;
    };
    expect(json).toEqual({ ok: true, position: 57 });
    const or = opsOf(db.calls, "store_reports", "or")[0]?.args[0] as string;
    expect(or).toBe(`created_at.gt.2026-10-01T00:00:00Z,and(created_at.eq.2026-10-01T00:00:00Z,id.gt.${FOCUS})`);
    expect(opsOf(db.calls, "store_reports", "eq").map((c) => c.args)).toContainEqual(["store_id", "s1"]);
  });

  it("다른 매장 신고·uuid 아님 → position null (쪽 이동 없음)", async () => {
    const db = fakeSb({ store_reports: { rows: [{ id: FOCUS, created_at: "2026-10-01T00:00:00Z", store_id: "s2" }] } });
    h.sb = db.sb;
    const other = (await (await reportsGET(req(`/api/admin/store-reports?focus_position=${FOCUS}&store_id=s1`) as never)).json()) as {
      position: number | null;
    };
    expect(other.position).toBeNull();
    const bad = (await (await reportsGET(req("/api/admin/store-reports?focus_position=sr-3") as never)).json()) as {
      position: number | null;
    };
    expect(bad.position).toBeNull();
  });
});

describe("business-cash-charges (Cash 충전 대기) — 100건 상한 제거", () => {
  it("limit/offset → range + total(count) · 없으면 예전 100건 · request_id = 한 건", async () => {
    const db = fakeSb({ business_cash_charge_requests: { rows: rows(150, (i) => ({ id: `c${i}`, status: "PENDING" })), count: 150 } });
    h.sb = db.sb;
    const paged = (await (await cashChargesGET(req("/api/admin/business-cash-charges?status=PENDING&limit=50&offset=100") as never)).json()) as Record<string, unknown>;
    expect(paged).toMatchObject({ ok: true, total: 150, limit: 50, offset: 100 });
    expect((paged.requests as unknown[]).length).toBe(50);
    expect(opsOf(db.calls, "business_cash_charge_requests", "range")[0].args).toEqual([100, 149]);
    expect(opsOf(db.calls, "business_cash_charge_requests", "limit")).toHaveLength(0);

    db.calls.length = 0;
    const legacy = (await (await cashChargesGET(req("/api/admin/business-cash-charges?status=PENDING") as never)).json()) as Record<string, unknown>;
    expect(legacy.total).toBeUndefined();
    expect(opsOf(db.calls, "business_cash_charge_requests", "limit")[0].args).toEqual([100]);

    db.calls.length = 0;
    const id = "7a1b2c3d-1111-4222-8333-444455556666";
    await cashChargesGET(req(`/api/admin/business-cash-charges?status=all&request_id=${id}`) as never);
    expect(opsOf(db.calls, "business_cash_charge_requests", "eq").map((c) => c.args)).toContainEqual(["id", id]);
  });
});

describe("store-payment-events (호출자 = 결제 수신 기록 화면 하나)", () => {
  it("항상 서버 페이지 — 비표준 limit 은 20, 200 상한 없음", async () => {
    const db = fakeSb({ store_payment_events: { rows: rows(60, (i) => ({ id: `e${i}` })), count: 60 } });
    h.sb = db.sb;
    const json = (await (await paymentEventsGET(req("/api/admin/store-payment-events?limit=999&offset=40"))).json()) as Record<string, unknown>;
    expect(json).toMatchObject({ ok: true, total: 60, limit: 20, offset: 40 });
    expect((json.events as unknown[]).length).toBe(20);
    expect(opsOf(db.calls, "store_payment_events", "range")[0].args).toEqual([40, 59]);
    expect(opsOf(db.calls, "store_payment_events", "limit")).toHaveLength(0);
  });
});

describe("delivery-operation-alerts 이벤트", () => {
  it("limit/offset → events_total(count) · 120/300 상한 없음, 없으면 events_limit 기본 120", async () => {
    const db = fakeSb({
      delivery_operation_alert_rules: { rows: [] },
      delivery_operation_alert_events: { rows: rows(80, (i) => ({ id: `ev${i}`, rule_id: null })), count: 345 },
    });
    h.sb = db.sb;
    const paged = (await (await alertsGET(new Request("https://x.test/api/admin/delivery-operation-alerts?limit=50&offset=50"))).json()) as Record<string, unknown>;
    expect(paged).toMatchObject({ events_total: 345, limit: 50, offset: 50 });
    expect((paged.events as unknown[]).length).toBe(30);
    expect(opsOf(db.calls, "delivery_operation_alert_events", "range")[0].args).toEqual([50, 99]);

    db.calls.length = 0;
    const legacy = (await (await alertsGET(new Request("https://x.test/api/admin/delivery-operation-alerts"))).json()) as Record<string, unknown>;
    expect(legacy.events_total).toBeUndefined();
    expect(opsOf(db.calls, "delivery_operation_alert_events", "limit")[0].args).toEqual([120]);
  });
});

describe("gift-certificates tracking (상품권 현황 목록)", () => {
  it("limit/offset → range + total · balance=gt0 은 DB 조건 · 200 상한 없음", async () => {
    const db = fakeSb({ gift_certificate_instances: { rows: rows(25, (i) => ({ id: `g${i}`, status: "ACTIVE" })), count: 9001 } });
    h.sb = db.sb;
    const json = (await (await giftTrackingGET(req("/api/admin/gift-certificates/tracking?limit=20&offset=0&status=active&balance=gt0"))).json()) as Record<string, unknown>;
    expect(json).toMatchObject({ ok: true, total: 9001, limit: 20, offset: 0 });
    expect((json.instances as unknown[]).length).toBe(20);
    expect(opsOf(db.calls, "gift_certificate_instances", "range")[0].args).toEqual([0, 19]);
    expect(opsOf(db.calls, "gift_certificate_instances", "gt")[0].args).toEqual(["remaining_balance", 0]);
    expect(opsOf(db.calls, "gift_certificate_instances", "limit")).toHaveLength(0);
  });
  it("파라미터 없으면 예전 응답 (최근 200건, total 없음) — 상세 화면 호환", async () => {
    const db = fakeSb({ gift_certificate_instances: { rows: [] } });
    h.sb = db.sb;
    const json = (await (await giftTrackingGET(req("/api/admin/gift-certificates/tracking"))).json()) as Record<string, unknown>;
    expect(json.total).toBeUndefined();
    expect(opsOf(db.calls, "gift_certificate_instances", "limit")[0].args).toEqual([200]);
  });
});

describe("store-discovery campaigns", () => {
  const campaign = (i: number) => ({
    id: `c${i}`,
    store_id: "s1",
    campaign_type: "event",
    title: `T${i}`,
    start_at: "2026-10-01T00:00:00Z",
    end_at: "2026-10-30T00:00:00Z",
    is_active: true,
  });
  it("limit/offset → range + total · 200 상한 없음", async () => {
    const db = fakeSb({ store_discovery_campaigns: { rows: rows(70, campaign), count: 70 }, stores: { rows: [] } });
    h.sb = db.sb;
    const json = (await (await discoveryCampaignsGET(req("/api/admin/store-discovery/campaigns?limit=50&offset=50"))).json()) as Record<string, unknown>;
    expect(json).toMatchObject({ ok: true, total: 70, limit: 50, offset: 50 });
    expect((json.campaigns as unknown[]).length).toBe(20);
    expect(opsOf(db.calls, "store_discovery_campaigns", "range")[0].args).toEqual([50, 99]);
    expect(opsOf(db.calls, "store_discovery_campaigns", "limit")).toHaveLength(0);
  });
});

describe("store-orders 감사 로그 page_size", () => {
  it("20/50/100 만 주소·API 로 왕복, 그 외 기본 50", () => {
    const sp = (s: string) => new URLSearchParams(s);
    const q = parseAdminOrderAuditQuery(sp("q=SO-1&page=2&page_size=100"));
    expect(q).toMatchObject({ page: 2, pageSize: 100 });
    expect(adminOrderAuditQueryToParams(q).toString()).toBe("q=SO-1&page=2&page_size=100");
    expect(parseAdminOrderAuditQuery(sp("page_size=30")).pageSize).toBe(50);
    expect(adminOrderAuditQueryToParams(parseAdminOrderAuditQuery(sp("page_size=50"))).toString()).toBe("");
  });
});
