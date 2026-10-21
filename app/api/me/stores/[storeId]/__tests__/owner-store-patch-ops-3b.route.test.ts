/**
 * 3-B RC-4 — PATCH /api/me/stores/[storeId]
 * OPS-09 (NOT NULL jsonb null → {} / [], expected_updated_at CAS → 409, DB 원문 비노출)
 * OPS-05 (stores.email = GCash 번호: 형식 오류 400, null 덮어쓰기 금지)
 * OPS-07 (is_visible 변경은 승인 매장만 → 409 store_not_approved_for_visibility)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const gateResult = vi.fn();

type Row = Record<string, unknown>;
let currentRow: Row;
let updates: Row[];
let updateEqs: Array<Array<[string, unknown]>>;
let updateResults: Array<{ data: Row | null; error: { message: string } | null } | undefined>;

function makeSb() {
  return {
    from(_table: string) {
      let patch: Row | null = null;
      let eqs: Array<[string, unknown]> = [];
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => {
          eqs.push([k, v]);
          return b;
        },
        update: (p: Row) => {
          patch = { ...p };
          eqs = [];
          updates.push(patch);
          updateEqs.push(eqs);
          return b;
        },
        maybeSingle: async () => {
          if (patch) {
            const forced = updateResults.shift();
            if (forced) return forced;
            return { data: { ...currentRow, ...patch, id: "store-1", slug: "store-one" }, error: null };
          }
          return { data: currentRow, error: null };
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/stores/owner-product-gate", () => ({ getStoreIfOwner: async () => gateResult() }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/admin/notifications/admin-notification-service", () => ({
  createAdminNotification: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: vi.fn(),
}));
vi.mock("@/lib/stores/after-canonical-store-location-write", () => ({ afterCanonicalStoreLocationWrite: vi.fn() }));
vi.mock("@/lib/stores/sync-store-orders-checkout-geo", () => ({
  refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({ invalidateMeStoresListServerCache: vi.fn() }));

import { PATCH } from "@/app/api/me/stores/[storeId]/route";

const ctx = { params: Promise.resolve({ storeId: "store-1" }) };
function req(body: unknown) {
  return new Request("http://localhost/api/me/stores/store-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
function gate(approval_status: string) {
  gateResult.mockReturnValue({
    ok: true,
    store: { id: "store-1", owner_user_id: "owner-1", approval_status, owner_can_edit_store_identity: false },
  });
}

describe("owner store PATCH — 3-B field validation (RC-4)", () => {
  beforeEach(() => {
    gateResult.mockReset();
    updates = [];
    updateEqs = [];
    updateResults = [];
    currentRow = {
      store_category_id: null,
      store_topic_id: null,
      email: "09171234567",
      is_open: true,
      region: null,
      city: null,
      district: null,
      address_line1: null,
      address_line2: null,
      place_id: null,
      formatted_address: null,
      detail_address: null,
      lat: null,
      lng: null,
      is_visible: false,
      business_hours_json: { min_order_php: 100 },
      gallery_images_json: ["a.jpg"],
      updated_at: "2026-10-21T01:00:00.000000+00:00",
    };
  });

  it("OPS-09: business_hours_json / gallery_images_json null → {} / [] (no NOT NULL 500)", async () => {
    gate("approved");
    const res = await PATCH(req({ business_hours_json: null, gallery_images_json: null }), ctx);
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({ business_hours_json: {}, gallery_images_json: [] });
  });

  it("OPS-09: invalid shapes stay 400", async () => {
    gate("approved");
    expect((await PATCH(req({ business_hours_json: [1] }), ctx)).status).toBe(400);
    expect((await PATCH(req({ gallery_images_json: { a: 1 } }), ctx)).status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("OPS-09: expected_updated_at → CAS on updated_at; 0 rows → 409 store_changed", async () => {
    gate("approved");
    updateResults = [{ data: null, error: null }];
    const res = await PATCH(
      req({ business_hours_json: { a: 1 }, expected_updated_at: "2026-10-21T00:59:00.000000+00:00" }),
      ctx
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("store_changed");
    expect(updateEqs[0]).toContainEqual(["updated_at", "2026-10-21T00:59:00.000000+00:00"]);
  });

  it("OPS-09: matching expected_updated_at saves; omitted token keeps the legacy unconditional save", async () => {
    gate("approved");
    const ok = await PATCH(
      req({ is_open: false, expected_updated_at: "2026-10-21T01:00:00.000000+00:00" }),
      ctx
    );
    expect(ok.status).toBe(200);
    const legacy = await PATCH(req({ is_open: false }), ctx);
    expect(legacy.status).toBe(200);
    expect(updateEqs[1].some(([k]) => k === "updated_at")).toBe(false);
  });

  it("OPS-09: malformed expected_updated_at → 400 before any write", async () => {
    gate("approved");
    const res = await PATCH(req({ is_open: false, expected_updated_at: "yesterday" }), ctx);
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("OPS-09: DB error message is not exposed to the client", async () => {
    gate("approved");
    updateResults = [{ data: null, error: { message: 'null value in column "x" violates not-null constraint' } }];
    const res = await PATCH(req({ is_open: false }), ctx);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe("update_failed");
  });

  it("OPS-05: valid GCash number is normalized and saved", async () => {
    gate("approved");
    const res = await PATCH(req({ email: "+63 917 765 4321" }), ctx);
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({ email: "09177654321" });
  });

  it("OPS-05: malformed value → 400, existing value is NOT overwritten with null", async () => {
    gate("approved");
    const res = await PATCH(req({ email: "owner@example.com" }), ctx);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_store_gcash_number");
    expect(updates).toHaveLength(0);
  });

  it("OPS-05: empty value clears (explicit)", async () => {
    gate("approved");
    await PATCH(req({ email: "  " }), ctx);
    expect(updates[0]).toEqual({ email: null });
  });

  it.each(["pending", "under_review", "revision_requested"])(
    "OPS-07: %s store cannot toggle is_visible → 409",
    async (st) => {
      gate(st);
      const res = await PATCH(req({ is_visible: true }), ctx);
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe("store_not_approved_for_visibility");
      expect(updates).toHaveLength(0);
    }
  );

  it("OPS-07: approved store toggle unchanged", async () => {
    gate("approved");
    const res = await PATCH(req({ is_visible: true }), ctx);
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ is_visible: true });
  });

  it("OPS-07: pending store can still edit other profile fields", async () => {
    gate("pending");
    const res = await PATCH(req({ is_open: false }), ctx);
    expect(res.status).toBe(200);
  });
});
