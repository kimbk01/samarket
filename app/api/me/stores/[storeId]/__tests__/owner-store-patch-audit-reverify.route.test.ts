/**
 * ACC-06 (owner store change audit) · ND-2 (approved store core location → re-verification flag + admin notice)
 * · OPS-02 (shared public cache generation bump) on PATCH /api/me/stores/[storeId].
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendAuditLog = vi.fn(async () => undefined);
const createAdminNotification = vi.fn(async () => ({ ok: true, created: 1, skippedRecipients: 0, pushed: 1 }));
const bump = vi.fn();
const gateResult = vi.fn();

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
            return { data: { ...currentRow, ...patch, id: "store-1", slug: "store-one", store_name: "Store One" }, error: null };
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
  createAdminNotification: (...a: unknown[]) => createAdminNotification(...(a as [])),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (r: string) => bump(r),
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

describe("owner store PATCH — audit · re-verification · cache bump", () => {
  beforeEach(() => {
    appendAuditLog.mockClear();
    createAdminNotification.mockClear();
    bump.mockClear();
    gateResult.mockReset();
    updates = [];
    updateErrors = [];
    currentRow = {
      store_category_id: null,
      store_topic_id: null,
      phone: "09171234567",
      is_open: true,
      region: "Metro Manila",
      city: "Quezon City",
      district: "1 Main St",
      address_line1: "1 Main St",
      address_line2: null,
      place_id: null,
      formatted_address: null,
      detail_address: null,
      lat: 14.65,
      lng: 121.05,
      is_visible: true,
      first_listed_at: null,
    };
  });

  it("ACC-06 + OPS-02: operating info change = audit only (no flag, no admin notice) + cache bump", async () => {
    gate("approved");
    const res = await PATCH(req({ is_open: false }), ctx);
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({ is_open: false });
    expect(appendAuditLog).toHaveBeenCalledTimes(1);
    const entry = (appendAuditLog.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(entry.action).toBe("store.owner_update");
    expect(entry.actor_type).toBe("user");
    expect(entry.target_id).toBe("store-1");
    expect(entry.before_json).toEqual({ is_open: true });
    expect(entry.after_json).toMatchObject({ is_open: false, fields: ["is_open"], approval_status: "approved" });
    expect(createAdminNotification).not.toHaveBeenCalled();
    expect(bump).toHaveBeenCalledWith("owner_store.profile");
  });

  it("ND-2: approved store coordinate change → applied + flagged in the same UPDATE + admin notified", async () => {
    gate("approved");
    const res = await PATCH(req({ lat: 14.7, lng: 121.1, confirmLocationMove: true }), ctx);
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      lat: 14.7,
      lng: 121.1,
      core_info_review_status: "pending_reverification",
      core_info_changed_fields: ["lat", "lng"],
    });
    expect(typeof updates[0].core_info_changed_at).toBe("string");
    expect(createAdminNotification).toHaveBeenCalledTimes(1);
    const n = (createAdminNotification.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(n).toMatchObject({
      kind: "store_core_info_changed",
      broadcastPermission: "business",
      linkUrl: "/admin/business/store-1",
      workRef: { table: "stores", id: "store-1" },
    });
    const audit = (appendAuditLog.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(audit.after_json).toMatchObject({ core_info_reverification: { fields: ["lat", "lng"], flag_saved: true } });
  });

  it("ND-2: same coordinates re-saved → no flag, no admin notice", async () => {
    gate("approved");
    await PATCH(req({ lat: 14.65, lng: 121.05 }), ctx);
    expect(updates[0]).not.toHaveProperty("core_info_review_status");
    expect(createAdminNotification).not.toHaveBeenCalled();
  });

  it("ND-2: non-approved store (in review) address change → no flag", async () => {
    gate("pending");
    await PATCH(req({ lat: 14.7, lng: 121.1, confirmLocationMove: true }), ctx);
    expect(updates[0]).not.toHaveProperty("core_info_review_status");
    expect(createAdminNotification).not.toHaveBeenCalled();
  });

  it("ND-2: before the flag migration is applied, the change still saves without the flag", async () => {
    gate("approved");
    updateErrors = [{ message: "Could not find the 'core_info_changed_at' column of 'stores' in the schema cache" }];
    const res = await PATCH(req({ lat: 14.7, lng: 121.1, confirmLocationMove: true }), ctx);
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(2);
    expect(updates[1]).not.toHaveProperty("core_info_review_status");
    expect(updates[1]).toMatchObject({ lat: 14.7, lng: 121.1 });
    const audit = (appendAuditLog.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(audit.after_json).toMatchObject({ core_info_reverification: { flag_saved: false } });
  });

  it("ACC-06: audit failure is logged and does not change the saved result", async () => {
    gate("approved");
    appendAuditLog.mockImplementationOnce(async () => {
      throw new Error("audit down");
    });
    const res = await PATCH(req({ phone: "09990000000" }), ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("no-op save (same value) writes no audit row", async () => {
    gate("approved");
    await PATCH(req({ is_open: true }), ctx);
    expect(appendAuditLog).not.toHaveBeenCalled();
  });

  it("rejected / suspended stores stay blocked before any write", async () => {
    gate("rejected");
    const res = await PATCH(req({ is_open: false }), ctx);
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
    expect(bump).not.toHaveBeenCalled();
  });
});
