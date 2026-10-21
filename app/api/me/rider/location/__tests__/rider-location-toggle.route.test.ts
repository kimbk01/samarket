/** LOC-012 — rider self location API honors the admin `delivery_rider_location_enabled` toggle. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const enabled = vi.fn();
const riderSelfPostLocation = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "rider-1" }));
vi.mock("@/lib/http/api-route", () => ({ enforceRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/delivery/delivery-ops-settings", () => ({
  loadDeliveryRiderLocationEnabled: async () => enabled(),
}));
vi.mock("@/lib/stores/store-order-delivery-service", () => ({
  riderSelfPostLocation: (...a: unknown[]) => riderSelfPostLocation(...a),
}));

import { POST } from "@/app/api/me/rider/location/route";

function req() {
  return new Request("http://localhost/api/me/rider/location", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: 14.55, lng: 121.02 }),
  }) as never;
}

describe("LOC-012 rider location toggle", () => {
  beforeEach(() => {
    enabled.mockReset();
    riderSelfPostLocation.mockReset().mockResolvedValue({ ok: true });
  });

  it("OFF → 409 rider_location_disabled, nothing stored", async () => {
    enabled.mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("rider_location_disabled");
    expect(riderSelfPostLocation).not.toHaveBeenCalled();
  });

  it("ON → stores as before", async () => {
    enabled.mockReturnValue(true);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(riderSelfPostLocation).toHaveBeenCalledTimes(1);
  });
});
