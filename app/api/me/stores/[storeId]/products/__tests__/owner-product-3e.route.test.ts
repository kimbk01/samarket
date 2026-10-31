/**
 * 3-E — 오너 상품 라우트: PRD-15(상한·멱등·500 원문 미노출·추천 재카운트·가드) · PRD-10(재고 0 자동 품절).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  filterValue,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";

const bump = vi.fn();
const countRecommended = vi.fn(async () => 0);
const sessionCheck = vi.fn(async () => ({ ok: true, profile: {} }) as unknown);
let storeStatus = "approved";
let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
let fake = createFakeStoreSupabase((c) => handler(c));

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: () => sessionCheck(),
  requirePhoneVerified: async () => ({ ok: true, profile: {} }),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/i18n/load-user-app-language", () => ({ loadUserAppLanguage: async () => "ko" }));
vi.mock("@/lib/stores/owner-product-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stores/owner-product-gate")>();
  return {
    ...actual,
    getStoreIfOwner: async () => ({
      ok: true,
      store: { id: "store-1", owner_user_id: "owner-1", approval_status: storeStatus, owner_can_edit_store_identity: false },
    }),
    canOwnerSellProducts: async () => true,
  };
});
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (...a: unknown[]) => bump(...a),
  syncStorePublicReadCachesWithSharedGeneration: async () => {},
}));
vi.mock("@/lib/stores/owner-products-list-snapshot", () => ({
  invalidateOwnerProductsListCache: () => {},
  loadOwnerProductsListSnapshot: async () => ({ ok: false, error: "relation secret_internal_table violates xyz" }),
  parseOwnerProductsListLimit: () => undefined,
  peekOwnerProductsListCacheHit: () => false,
}));
vi.mock("@/lib/stores/store-menus-snapshot-invalidate-by-store-id", () => ({
  invalidateStoreMenusSnapshotCacheByStoreId: () => {},
}));
vi.mock("@/lib/stores/owner-recommended-menu-limit", () => ({
  countOwnerRecommendedProducts: () => countRecommended(),
  OWNER_RECOMMENDED_MENU_MAX: 6,
}));
vi.mock("@/lib/media/canonical-image-lifecycle.server", () => ({
  collectCanonicalImagePublicUrls: () => [],
  diffRemovedImageUrls: () => [],
  removeCanonicalImagesFromPublicUrls: async () => ({ failed: [] }),
}));
vi.mock("@/lib/auth/active-session", () => ({
  readActiveSessionIdCookie: async () => "sess",
  readActiveSessionFingerprintForUser: async () => "sess",
}));
vi.mock("@/lib/auth/auth-session-validate-cache", () => ({ peekAuthSessionValidateCached: () => true }));
vi.mock("@/lib/auth/auth-session-validate-dedupe", () => ({
  validateActiveSessionLightDeduped: async () => ({ ok: true, ttlCacheHit: true }),
}));
vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: async () => ({ ok: true, store: { id: "store-1" } }),
  peekOwnerStoreOwnershipCacheHit: () => true,
}));

import { GET, POST } from "@/app/api/me/stores/[storeId]/products/route";
import { PATCH } from "@/app/api/me/stores/[storeId]/products/[productId]/route";

const ctx = { params: Promise.resolve({ storeId: "store-1" }) };
const pctx = { params: Promise.resolve({ storeId: "store-1", productId: "p-1" }) };

function post(body: Record<string, unknown>) {
  return POST(
    new Request("https://x.test/api/me/stores/store-1/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    ctx
  );
}
function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("https://x.test/api/me/stores/store-1/products/p-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    pctx
  );
}

const validBody = {
  title: "Burger",
  price: 100,
  menu_section_id: "sec-1",
  thumbnail_url: "https://x/t.jpg",
  product_status: "active",
};

/** In-memory store_products with the partial unique (store_id, client_request_id) index. */
function productsDb(opts: { insertError?: string; missingKeyColumn?: boolean } = {}) {
  const rows: Record<string, unknown>[] = [];
  handler = (call) => {
    if (call.table === "store_menu_sections") return { data: [{ id: "sec-1" }], error: null };
    if (call.table !== "store_products") return { data: null, error: null };
    if (call.op === "insert") {
      if (opts.insertError) return { data: null, error: { message: opts.insertError } };
      const row = call.patch as Record<string, unknown>;
      if (opts.missingKeyColumn && "client_request_id" in row) {
        return { data: null, error: { message: "Could not find the 'client_request_id' column of 'store_products' in the schema cache" } };
      }
      const key = row.client_request_id;
      if (key != null && rows.some((r) => r.store_id === row.store_id && r.client_request_id === key)) {
        return {
          data: null,
          error: { message: 'duplicate key value violates unique constraint "store_products_store_client_request_id_key"' },
        };
      }
      const created = { ...row, id: `p-${rows.length + 1}` };
      rows.push(created);
      return { data: { id: created.id }, error: null };
    }
    if (call.op === "select") {
      const key = filterValue(call, "client_request_id");
      const hit = rows.find((r) => r.client_request_id === key);
      return { data: hit ? { id: hit.id } : null, error: null };
    }
    if (call.op === "delete") {
      const id = filterValue(call, "id");
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  storeStatus = "approved";
  countRecommended.mockImplementation(async () => 0);
  sessionCheck.mockImplementation(async () => ({ ok: true, profile: {} }));
  fake = createFakeStoreSupabase((c) => handler(c));
});

describe("POST — PRD-15 limits / idempotency / errors", () => {
  it("rejects over-limit title, summary, price, stock (400 + code)", async () => {
    productsDb();
    for (const [over, code] of [
      [{ title: "a".repeat(121) }, "title_too_long"],
      [{ summary: "s".repeat(501) }, "summary_too_long"],
      [{ price: 10_000_001 }, "price_too_large"],
      [{ stock_qty: 1_000_000 }, "stock_too_large"],
    ] as const) {
      const res = await post({ ...validBody, ...over });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(code);
    }
    expect(fake.calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("same client_request_id twice → one row, second returns the same product", async () => {
    const rows = productsDb();
    const key = "3f2a9d1c-1111-4444-8888-000000000000";
    const r1 = await post({ ...validBody, client_request_id: key });
    const r2 = await post({ ...validBody, client_request_id: key });
    const j1 = await r1.json();
    const j2 = await r2.json();
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(j2).toMatchObject({ ok: true, idempotent: true, product: { id: j1.product.id } });
    expect(rows).toHaveLength(1);
  });

  it("missing client_request_id column (migration pending) → key-less insert still works", async () => {
    const rows = productsDb({ missingKeyColumn: true });
    const res = await post({ ...validBody, client_request_id: "3f2a9d1c-1111-4444-8888-000000000000" });
    expect(res.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("client_request_id");
  });

  it("500 never echoes the DB message", async () => {
    productsDb({ insertError: 'violates check constraint "secret_internal_name"' });
    const res = await post(validBody);
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.error).toBe("db_error");
    expect(JSON.stringify(j)).not.toContain("secret_internal_name");
  });

  it("GET list failure → db_error (no raw message)", async () => {
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("https://x.test/api/me/stores/store-1/products?cursor=abc"), ctx);
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.error).toBe("db_error");
    expect(JSON.stringify(j)).not.toContain("secret_internal_table");
  });

  it("recommended limit race: recount after insert > 6 → row rolled back, 409", async () => {
    const rows = productsDb();
    countRecommended.mockImplementationOnce(async () => 5).mockImplementationOnce(async () => 7);
    const res = await post({ ...validBody, is_owner_recommended: true, is_representative: false });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("owner_recommended_limit");
    expect(rows).toHaveLength(0);
    expect(bump).not.toHaveBeenCalled();
  });

  it("suspended store → 403 store_suspended (1-B gate); inactive session → session response", async () => {
    productsDb();
    storeStatus = "suspended";
    const res = await post(validBody);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("store_suspended");
    storeStatus = "approved";
    const { NextResponse } = await import("next/server");
    sessionCheck.mockImplementationOnce(async () => ({
      ok: false,
      response: NextResponse.json({ ok: false, error: "session" }, { status: 401 }),
    }));
    const res2 = await post(validBody);
    expect(res2.status).toBe(401);
  });
});

describe("POST/PATCH — PRD-10 stock 0 auto sold-out", () => {
  it("POST tracked + stock 0 + active → saved sold_out(stock), auto_sold_out flag", async () => {
    const rows = productsDb();
    const res = await post({ ...validBody, track_inventory: true, stock_qty: 0 });
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, auto_sold_out: true });
    expect(rows[0]).toMatchObject({ product_status: "sold_out", sold_out_reason: "stock" });
  });

  it("POST untracked stock 0 stays active", async () => {
    const rows = productsDb();
    const res = await post({ ...validBody, track_inventory: false, stock_qty: 0 });
    expect((await res.json()).auto_sold_out).toBeUndefined();
    expect(rows[0]).toMatchObject({ product_status: "active" });
  });
});

function patchScenario(row: Record<string, unknown>, opts: { updateError?: string } = {}) {
  let current = { ...row };
  handler = (call) => {
    if (call.table !== "store_products") return { data: [], error: null };
    if (call.op === "select") return { data: current, error: null };
    if (call.op === "update") {
      if (opts.updateError) return { data: null, error: { message: opts.updateError } };
      current = { ...current, ...call.patch, updated_at: "2026-10-21T00:00:01Z" };
      return { data: [{ id: current.id, updated_at: current.updated_at }], error: null };
    }
    return { data: null, error: null };
  };
  return () => current;
}

const baseRow = {
  id: "p-1",
  store_id: "store-1",
  title: "Burger",
  summary: "s".repeat(600), // legacy over-limit value (production has 13 such rows)
  price: 100,
  stock_qty: 3,
  track_inventory: true,
  thumbnail_url: "https://x/t.jpg",
  images_json: [],
  product_status: "active",
  admin_review_status: "none",
  admin_status_lock: null,
  sold_out_reason: null,
  updated_at: "2026-10-21T00:00:00Z",
};

describe("PATCH — PRD-10 / PRD-15", () => {
  it("stock → 0 on an active tracked product saves sold_out(stock) and returns auto_sold_out", async () => {
    const cur = patchScenario(baseRow);
    const res = await patch({ stock_qty: 0 });
    expect(await res.json()).toMatchObject({ ok: true, auto_sold_out: true });
    expect(cur()).toMatchObject({ product_status: "sold_out", sold_out_reason: "stock", stock_qty: 0 });
  });

  it("legacy over-limit summary passes when the summary is not changed", async () => {
    patchScenario(baseRow);
    const res = await patch({ title: "Burger 2", summary: baseRow.summary });
    expect(res.status).toBe(200);
  });

  it("changing summary to an over-limit value is rejected", async () => {
    patchScenario(baseRow);
    const res = await patch({ summary: "t".repeat(501) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("summary_too_long");
  });

  it("duplicate option name → 400 duplicate_option_name", async () => {
    patchScenario(baseRow);
    const res = await patch({
      options_json: [
        {
          id: "g1",
          nameKo: "Size",
          inputType: "radio",
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: "a", name: "Large", priceDelta: 0 },
            { id: "b", name: "LARGE", priceDelta: 20 },
          ],
        },
      ],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("duplicate_option_name");
  });

  it("update DB error → 500 db_error without the raw message", async () => {
    patchScenario(baseRow, { updateError: "permission denied for secret_table" });
    const res = await patch({ title: "New" });
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.error).toBe("db_error");
    expect(JSON.stringify(j)).not.toContain("secret_table");
  });

  it("suspended store → 403 store_suspended", async () => {
    patchScenario(baseRow);
    storeStatus = "suspended";
    const res = await patch({ title: "New" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("store_suspended");
  });
});
