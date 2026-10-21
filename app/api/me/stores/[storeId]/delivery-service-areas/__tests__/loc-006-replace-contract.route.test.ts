/**
 * LOC-006 — owner service-area replace: catalog validation (400 unknown_lgu), optimistic concurrency
 * (409 service_areas_version_conflict), expected version forwarded to the atomic RPC, owner audit row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const replaceStoreDeliveryServiceAreas = vi.fn();
const loadStoreDeliveryServiceAreas = vi.fn();
const loadStoreDeliveryServiceAreasVersion = vi.fn();
const appendAuditLog = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: {
            id: "store-1",
            city: "Makati",
            region: "Metro Manila",
            lat: 14.55,
            lng: 121.02,
            delivery_radius_km: 5,
            delivery_service_area_authority: "legacy_radius",
          },
          error: null,
        }),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async () => ({ ok: true, store: { id: "store-1", approval_status: "approved" } }),
  ownerStoreProfileWriteBlock: () => null,
}));
vi.mock("@/lib/stores/discovery/invalidate-discovery-after-store-write", () => ({
  invalidateDiscoveryAfterStoreWrite: vi.fn(),
}));
vi.mock("@/lib/stores/store-home-feed-server-cache", () => ({ clearStoreHomeFeedServerCache: vi.fn() }));
vi.mock("@/lib/delivery/service-area/candidate-discovery", () => ({ resolveStoreHomeLguId: () => "lgu-home" }));
vi.mock("@/lib/delivery/service-area/build-service-area-editor-payload", () => ({
  buildDeliveryServiceAreaEditorPayload: () => ({}),
}));
vi.mock("@/lib/geo/ph-lgu/platform-ph-lgu", () => ({
  searchPlatformPhLgu: () => [],
  getPlatformPhLguDisplayNameById: (id: string) => (id.startsWith("lgu-") ? `name:${id}` : null),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({
  appendAuditLog: (...a: unknown[]) => appendAuditLog(...a),
}));
vi.mock("@/lib/delivery/service-area/store-delivery-service-areas", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/delivery/service-area/store-delivery-service-areas")
  >("@/lib/delivery/service-area/store-delivery-service-areas");
  return {
    ...actual,
    loadStoreDeliveryServiceAreas: (...a: unknown[]) => loadStoreDeliveryServiceAreas(...a),
    loadStoreDeliveryServiceAreasVersion: (...a: unknown[]) => loadStoreDeliveryServiceAreasVersion(...a),
    replaceStoreDeliveryServiceAreas: (...a: unknown[]) => replaceStoreDeliveryServiceAreas(...a),
  };
});

import { GET, PUT } from "@/app/api/me/stores/[storeId]/delivery-service-areas/route";
import { StoreDeliveryServiceAreasVersionConflictError } from "@/lib/delivery/service-area/store-delivery-service-areas";

const ctx = { params: Promise.resolve({ storeId: "store-1" }) };

function jsonReq(method: string, body?: unknown) {
  return new Request("http://localhost/api/me/stores/store-1/delivery-service-areas", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

describe("LOC-006 owner delivery-service-areas replace contract", () => {
  beforeEach(() => {
    replaceStoreDeliveryServiceAreas.mockReset();
    loadStoreDeliveryServiceAreas.mockReset().mockResolvedValue([]);
    loadStoreDeliveryServiceAreasVersion.mockReset().mockResolvedValue("2026-10-21T00:00:00.123456+00:00");
    appendAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("GET returns areasVersion for the editor", async () => {
    const res = await GET(jsonReq("GET"), ctx);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.areasVersion).toBe("2026-10-21T00:00:00.123456+00:00");
  });

  it("PUT with an id outside the LGU catalog → 400 unknown_lgu, RPC not called", async () => {
    const res = await PUT(jsonReq("PUT", { geoIdentities: ["lgu-a", "bogus"] }), ctx);
    const j = await res.json();
    expect(res.status).toBe(400);
    expect(j.error).toBe("unknown_lgu");
    expect(j.unknown_ids).toEqual(["bogus"]);
    expect(replaceStoreDeliveryServiceAreas).not.toHaveBeenCalled();
  });

  it("PUT forwards expectedAreasVersion and writes an owner audit row", async () => {
    replaceStoreDeliveryServiceAreas.mockResolvedValue({
      authority: "v2_lgu",
      geoIdentities: ["lgu-a"],
      version: "2026-10-21T01:00:00.000001+00:00",
    });
    const res = await PUT(
      jsonReq("PUT", {
        geoIdentities: ["lgu-a"],
        activateV2: true,
        expectedAreasVersion: "2026-10-21T00:00:00.123456+00:00",
      }),
      ctx
    );
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.areasVersion).toBe("2026-10-21T01:00:00.000001+00:00");
    expect(replaceStoreDeliveryServiceAreas).toHaveBeenCalledTimes(1);
    expect(replaceStoreDeliveryServiceAreas.mock.calls[0]![1]).toMatchObject({
      storeId: "store-1",
      source: "owner",
      activateV2: true,
      storeHomeLguId: "lgu-home",
      expectedVersion: "2026-10-21T00:00:00.123456+00:00",
    });
    expect(appendAuditLog).toHaveBeenCalledTimes(1);
    expect(appendAuditLog.mock.calls[0]![1]).toMatchObject({
      actor_type: "user",
      actor_id: "owner-1",
      target_type: "store",
      target_id: "store-1",
      action: "store.delivery_service_areas_replace",
    });
  });

  it("PUT with null expectedAreasVersion (no saved rows) forwards null; omitted → undefined (no check)", async () => {
    replaceStoreDeliveryServiceAreas.mockResolvedValue({ authority: "legacy_radius", geoIdentities: [], version: null });
    await PUT(jsonReq("PUT", { geoIdentities: [], expectedAreasVersion: null }), ctx);
    expect(replaceStoreDeliveryServiceAreas.mock.calls[0]![1].expectedVersion).toBeNull();
    await PUT(jsonReq("PUT", { geoIdentities: [] }), ctx);
    expect(replaceStoreDeliveryServiceAreas.mock.calls[1]![1].expectedVersion).toBeUndefined();
  });

  it("stale version → 409 service_areas_version_conflict, no audit", async () => {
    replaceStoreDeliveryServiceAreas.mockRejectedValue(
      new StoreDeliveryServiceAreasVersionConflictError("2026-10-21T02:00:00+00:00")
    );
    const res = await PUT(
      jsonReq("PUT", { geoIdentities: ["lgu-a"], expectedAreasVersion: "2026-10-21T00:00:00+00:00" }),
      ctx
    );
    const j = await res.json();
    expect(res.status).toBe(409);
    expect(j.error).toBe("service_areas_version_conflict");
    expect(j.current_version).toBe("2026-10-21T02:00:00+00:00");
    expect(appendAuditLog).not.toHaveBeenCalled();
  });
});
