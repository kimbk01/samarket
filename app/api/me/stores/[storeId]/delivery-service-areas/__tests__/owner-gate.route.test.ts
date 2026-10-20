/**
 * P0-3 (LOC-001) — getStoreIfOwner returns `{ ok: false }` (truthy) for non-owners;
 * every handler must reject on `!gate.ok`, never on `!gate`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const gateResult = vi.fn();
const replaceStoreDeliveryServiceAreas = vi.fn();
const loadStoreDeliveryServiceAreas = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "intruder-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/owner-product-gate", () => ({ getStoreIfOwner: async () => gateResult() }));
vi.mock("@/lib/stores/discovery/invalidate-discovery-after-store-write", () => ({
  invalidateDiscoveryAfterStoreWrite: vi.fn(),
}));
vi.mock("@/lib/stores/store-home-feed-server-cache", () => ({ clearStoreHomeFeedServerCache: vi.fn() }));
vi.mock("@/lib/delivery/service-area/candidate-discovery", () => ({ resolveStoreHomeLguId: () => null }));
vi.mock("@/lib/delivery/service-area/build-service-area-editor-payload", () => ({
  buildDeliveryServiceAreaEditorPayload: () => ({}),
}));
vi.mock("@/lib/delivery/service-area/store-delivery-service-areas", () => ({
  loadStoreDeliveryServiceAreas: (...a: unknown[]) => loadStoreDeliveryServiceAreas(...a),
  replaceStoreDeliveryServiceAreas: (...a: unknown[]) => replaceStoreDeliveryServiceAreas(...a),
}));
vi.mock("@/lib/geo/ph-lgu/platform-ph-lgu", () => ({ searchPlatformPhLgu: () => [] }));

import { GET, POST, PUT } from "@/app/api/me/stores/[storeId]/delivery-service-areas/route";

const ctx = { params: Promise.resolve({ storeId: "store-of-someone-else" }) };

function jsonReq(method: string, body: unknown) {
  return new Request("http://localhost/api/me/stores/x/delivery-service-areas", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("delivery-service-areas owner gate", () => {
  beforeEach(() => {
    gateResult.mockReset();
    replaceStoreDeliveryServiceAreas.mockReset();
    loadStoreDeliveryServiceAreas.mockReset();
    gateResult.mockReturnValue({ ok: false, status: 403, error: "forbidden" });
  });

  it("GET rejects a non-owner", async () => {
    const res = await GET(jsonReq("GET", undefined) as never, ctx);
    expect(res.status).toBe(403);
    expect(loadStoreDeliveryServiceAreas).not.toHaveBeenCalled();
  });

  it("PUT rejects a non-owner and never replaces areas", async () => {
    const res = await PUT(jsonReq("PUT", { geoIdentities: [], activateV2: true }), ctx);
    expect(res.status).toBe(403);
    expect(replaceStoreDeliveryServiceAreas).not.toHaveBeenCalled();
  });

  it("POST rejects a non-owner", async () => {
    const res = await POST(jsonReq("POST", { q: "manila" }), ctx);
    expect(res.status).toBe(403);
  });

  it("missing store maps to 404", async () => {
    gateResult.mockReturnValue({ ok: false, status: 404, error: "store_not_found" });
    const res = await PUT(jsonReq("PUT", { geoIdentities: [] }), ctx);
    expect(res.status).toBe(404);
    expect(replaceStoreDeliveryServiceAreas).not.toHaveBeenCalled();
  });
});
