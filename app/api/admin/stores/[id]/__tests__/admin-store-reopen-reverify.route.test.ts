/**
 * ACC-04 「재심사 열기」(rejected → revision_requested, 사유 필수·감사·사장님 알림)
 * ND-2 「재검증 완료」(pending_reverification → none, CAS · 감사) on PATCH /api/admin/stores/[id].
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendAuditLog = vi.fn(async () => undefined);
const notifyOwner = vi.fn(async () => true);
const bump = vi.fn();

type Row = Record<string, unknown>;
let storeRow: Row;
let updateCalls: Array<{ patch: Row; eqs: Array<[string, unknown]> }>;
let updateResultRows: Row[][];

function makeSb() {
  return {
    from(_table: string) {
      let call: { patch: Row; eqs: Array<[string, unknown]> } | null = null;
      const b = {
        select: () => {
          if (call) return Promise.resolve({ data: updateResultRows.shift() ?? [], error: null });
          return b;
        },
        eq: (col: string, val: unknown) => {
          if (call) call.eqs.push([col, val]);
          return b;
        },
        update: (patch: Row) => {
          call = { patch, eqs: [] };
          updateCalls.push(call);
          return b;
        },
        maybeSingle: async () => ({ data: storeRow, error: null }),
      };
      return b;
    },
  };
}

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" } }),
}));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "admin-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => appendAuditLog(...(a as [])) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/admin-business/admin-store-decision", async () => {
  const rules = await vi.importActual<Record<string, unknown>>("@/lib/admin-business/admin-store-decision-rules");
  return { ...rules, safeNotifyOwnerStoreDecision: (...a: unknown[]) => notifyOwner(...(a as [])) };
});
vi.mock("@/lib/admin-business/load-business-control-center-detail", () => ({ loadBusinessControlCenterDetail: vi.fn() }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (r: string) => bump(r),
}));
vi.mock("@/lib/stores/store-home-feed-server-cache", () => ({ clearStoreHomeFeedServerCache: vi.fn() }));
vi.mock("@/lib/stores/store-public-cache-invalidate-server", () => ({ invalidateStorePublicCachesForSlugOnServer: vi.fn() }));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({ invalidateMeStoresListServerCache: vi.fn() }));
vi.mock("@/lib/stores/discovery/invalidate-discovery-after-store-write", () => ({ invalidateDiscoveryAfterStoreWrite: vi.fn() }));
vi.mock("@/lib/stores/discovery/invalidate-discovery-store-projections", () => ({ invalidateDiscoveryGlobalDistancePolicy: vi.fn() }));
vi.mock("@/lib/stores/after-canonical-store-location-write", () => ({ afterCanonicalStoreLocationWrite: vi.fn() }));
vi.mock("@/lib/stores/sync-store-orders-checkout-geo", () => ({
  refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged: vi.fn(),
}));
vi.mock("@/lib/delivery/delivery-ops-settings", () => ({
  DELIVERY_OPS_SETTING_KEYS: {},
  invalidateDeliveryDistanceSettingsCache: vi.fn(),
}));

import { PATCH } from "@/app/api/admin/stores/[id]/route";

const ctx = { params: Promise.resolve({ id: "store-9" }) };
function req(body: unknown) {
  return new Request("http://localhost/api/admin/stores/store-9", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("admin store PATCH — reopen rejected application (ACC-04)", () => {
  beforeEach(() => {
    appendAuditLog.mockClear();
    notifyOwner.mockClear();
    bump.mockClear();
    updateCalls = [];
    updateResultRows = [];
    storeRow = {
      id: "store-9",
      owner_user_id: "owner-9",
      approval_status: "rejected",
      rejected_reason: "missing permit",
      is_visible: false,
      store_name: "Nine",
      slug: "nine",
    };
  });

  it("requires a reason", async () => {
    const res = await PATCH(req({ action: "reopen_application" }), ctx);
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it("rejected → revision_requested with CAS on the seen status, audit and owner notice", async () => {
    updateResultRows = [[{ id: "store-9" }]];
    const res = await PATCH(req({ action: "reopen_application", reason: "permit uploaded — please resubmit" }), ctx);
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toEqual({
      approval_status: "revision_requested",
      revision_note: "permit uploaded — please resubmit",
      rejected_reason: null,
    });
    expect(updateCalls[0].eqs).toContainEqual(["approval_status", "rejected"]);
    const audit = (appendAuditLog.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(audit.action).toBe("store.reopen_application");
    expect(audit.before_json).toMatchObject({ approval_status: "rejected", rejected_reason: "missing permit" });
    expect(notifyOwner).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "reopen_application" }));
  });

  it("concurrent decision (status already changed) → 409 status_changed", async () => {
    updateResultRows = [[]];
    const res = await PATCH(req({ action: "reopen_application", reason: "reopen it" }), ctx);
    expect(res.status).toBe(409);
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("non-rejected store cannot be reopened", async () => {
    storeRow.approval_status = "approved";
    const res = await PATCH(req({ action: "reopen_application", reason: "reopen it" }), ctx);
    expect(res.status).toBe(409);
    expect(updateCalls).toHaveLength(0);
  });

  it("rejected store still cannot be approved directly", async () => {
    const res = await PATCH(req({ action: "approve_store", reason: "looks ok" }), ctx);
    expect(res.status).toBe(409);
  });
});

describe("admin store PATCH — confirm core info re-verified (ND-2)", () => {
  beforeEach(() => {
    appendAuditLog.mockClear();
    updateCalls = [];
    updateResultRows = [];
    storeRow = { id: "store-9", owner_user_id: "owner-9", approval_status: "approved", store_name: "Nine", slug: "nine", lat: 14.7 };
  });

  it("clears the flag with CAS on status + seen changed_at, audits", async () => {
    updateResultRows = [[{ id: "store-9", core_info_changed_at: "2026-10-21T01:00:00Z", core_info_changed_fields: ["lat"] }]];
    const res = await PATCH(
      req({ action: "confirm_core_info_reverified", expected_core_info_changed_at: "2026-10-21T01:00:00Z" }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toMatchObject({ core_info_review_status: "none", core_info_verified_by: "admin-1" });
    expect(updateCalls[0].eqs).toContainEqual(["core_info_review_status", "pending_reverification"]);
    expect(updateCalls[0].eqs).toContainEqual(["core_info_changed_at", "2026-10-21T01:00:00Z"]);
    const audit = (appendAuditLog.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(audit.action).toBe("store.confirm_core_info_reverified");
    expect(audit.before_json).toMatchObject({ core_info_review_status: "pending_reverification", core_info_changed_fields: ["lat"] });
  });

  it("already cleared or owner changed again meanwhile → 409 status_changed", async () => {
    updateResultRows = [[]];
    const res = await PATCH(
      req({ action: "confirm_core_info_reverified", expected_core_info_changed_at: "2026-10-20T00:00:00Z" }),
      ctx
    );
    expect(res.status).toBe(409);
    expect(appendAuditLog).not.toHaveBeenCalled();
  });
});
