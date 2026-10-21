/**
 * PATCH /api/me/stores/[storeId] location guards
 * - LOC-013: unchanged coords (7 dp) → no checkout-geo refresh, discovery patch without lat/lng; real move → once
 * - LOC-007: move > 1 km or other LGU than the saved City → 409 store_location_move_confirm_required;
 *            confirmLocationMove:true → saved (audited via store.owner_update)
 * - LOC-005: DB guard error → same 400 code as the API check
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendAuditLog = vi.fn(async () => undefined);
const refreshGeo = vi.fn(async () => ({ ok: true }));
const afterWrite = vi.fn();
const gateResult = vi.fn();
const homeLgu = vi.fn();

type Row = Record<string, unknown>;
let currentRow: Row;
let updates: Row[];
let updateErrors: Array<{ message: string } | null>;

function makeSb() {
  return {
    from(_table: string) {
      let patch: Row | null = null;
      const b = {
        select: () => b,
        eq: () => b,
        update: (p: Row) => {
          patch = { ...p };
          updates.push(patch);
          return b;
        },
        maybeSingle: async () => {
          if (patch) {
            const err = updateErrors.shift() ?? null;
            if (err) return { data: null, error: err };
            return { data: { ...currentRow, ...patch, id: "store-1", slug: "store-one", store_name: "S" }, error: null };
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
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => appendAuditLog(...(a as [])) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/admin/notifications/admin-notification-service", () => ({
  createAdminNotification: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({ bumpStorePublicSharedCacheGeneration: vi.fn() }));
vi.mock("@/lib/stores/after-canonical-store-location-write", () => ({
  afterCanonicalStoreLocationWrite: (...a: unknown[]) => afterWrite(...a),
}));
vi.mock("@/lib/stores/sync-store-orders-checkout-geo", () => ({
  refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged: (...a: unknown[]) => refreshGeo(...(a as [])),
}));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({ invalidateMeStoresListServerCache: vi.fn() }));
vi.mock("@/lib/delivery/service-area/candidate-discovery", () => ({
  resolveStoreHomeLguId: (input: unknown) => homeLgu(input),
}));

import { PATCH } from "@/app/api/me/stores/[storeId]/route";

const ctx = { params: Promise.resolve({ storeId: "store-1" }) };
function req(body: unknown) {
  return new Request("http://localhost/api/me/stores/store-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("owner store PATCH — LOC-013 / LOC-007 / LOC-005", () => {
  beforeEach(() => {
    appendAuditLog.mockClear();
    refreshGeo.mockClear();
    afterWrite.mockClear();
    gateResult.mockReset().mockReturnValue({
      ok: true,
      store: { id: "store-1", owner_user_id: "owner-1", approval_status: "pending", owner_can_edit_store_identity: false },
    });
    // city LGU and pin LGU agree unless a test overrides
    homeLgu.mockReset().mockReturnValue("lgu-qc");
    updates = [];
    updateErrors = [];
    currentRow = {
      store_category_id: null,
      store_topic_id: null,
      phone: "09171234567",
      region: "Metro Manila",
      city: "Quezon City",
      district: "1 Main St",
      address_line1: "1 Main St",
      address_line2: null,
      place_id: null,
      formatted_address: null,
      detail_address: null,
      lat: 14.6500001,
      lng: 121.0500001,
      delivery_available: true,
      is_visible: true,
      first_listed_at: null,
    };
  });

  it("LOC-013: phone change + same coords re-sent (7 dp) → no checkout-geo refresh, discovery patch without coords", async () => {
    const res = await PATCH(req({ phone: "09990000000", lat: 14.65000012, lng: 121.05000008 }), ctx);
    expect(res.status).toBe(200);
    expect(refreshGeo).not.toHaveBeenCalled();
    expect(afterWrite).toHaveBeenCalledTimes(1);
    const effectsPatch = (afterWrite.mock.calls[0]![0] as { patch: Row }).patch;
    expect(effectsPatch).not.toHaveProperty("lat");
    expect(effectsPatch).not.toHaveProperty("lng");
    expect(effectsPatch).toHaveProperty("phone");
  });

  it("LOC-013: real small move (< 1 km, same LGU) → saved, checkout-geo refresh exactly once", async () => {
    const res = await PATCH(req({ lat: 14.652, lng: 121.05 }), ctx);
    expect(res.status).toBe(200);
    expect(refreshGeo).toHaveBeenCalledTimes(1);
    expect((afterWrite.mock.calls[0]![0] as { patch: Row }).patch).toMatchObject({ lat: 14.652 });
  });

  it("LOC-007: move > 1 km without confirmation → 409, nothing written", async () => {
    const res = await PATCH(req({ lat: 14.7, lng: 121.1 }), ctx);
    expect(res.status).toBe(409);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.error).toBe("store_location_move_confirm_required");
    expect(j.reasons).toEqual(["move_over_1km"]);
    expect(typeof j.move_km).toBe("number");
    expect(j.move_km as number).toBeGreaterThan(1);
    expect(updates).toHaveLength(0);
    expect(refreshGeo).not.toHaveBeenCalled();
  });

  it("LOC-007: pin in another LGU than the saved City (even < 1 km) → 409 lgu_mismatch", async () => {
    homeLgu.mockImplementation((input: { storeLat?: number }) => (input.storeLat != null ? "lgu-other" : "lgu-qc"));
    const res = await PATCH(req({ lat: 14.651, lng: 121.05 }), ctx);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reasons: string[] }).reasons).toEqual(["lgu_mismatch"]);
    expect(updates).toHaveLength(0);
  });

  it("LOC-007: confirmLocationMove:true → saved, audited (store.owner_update with lat/lng before/after), refresh once", async () => {
    const res = await PATCH(req({ lat: 14.7, lng: 121.1, confirmLocationMove: true }), ctx);
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ lat: 14.7, lng: 121.1 });
    expect(updates[0]).not.toHaveProperty("confirmLocationMove");
    expect(refreshGeo).toHaveBeenCalledTimes(1);
    const audit = (appendAuditLog.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(audit.action).toBe("store.owner_update");
    expect(audit.before_json).toMatchObject({ lat: 14.6500001, lng: 121.0500001 });
    expect(audit.after_json).toMatchObject({ lat: 14.7, lng: 121.1 });
  });

  it("LOC-007: first pin (no saved coords) is not a 'move' — only LGU check applies", async () => {
    currentRow = { ...currentRow, lat: null, lng: null, delivery_available: false };
    const res = await PATCH(req({ lat: 14.7, lng: 121.1 }), ctx);
    expect(res.status).toBe(200);
  });

  it("LOC-005: DB guard violation maps to 400 store_delivery_requires_canonical_geo", async () => {
    updateErrors = [{ message: "store_delivery_requires_canonical_geo" }];
    const res = await PATCH(req({ phone: "09990000001" }), ctx);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("store_delivery_requires_canonical_geo");
  });
});
