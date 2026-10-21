/**
 * LOC-004 — (a) order-time serviceability snapshot goes into `create_store_order_atomic` p_order (same INSERT,
 * no post-UPDATE); (b) a store move refreshes in-progress orders' ETA only, never the order-time distances.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY } from "@/lib/delivery/store-order-serviceability-snapshot-ready";

vi.mock("@/lib/delivery/delivery-ops-settings", () => ({
  loadDeliveryRideTimeSource: async () => "store",
}));

import {
  refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged,
  storeOrderCheckoutEtaOnlyPatch,
} from "@/lib/stores/sync-store-orders-checkout-geo";

const root = process.cwd();

describe("LOC-004 (a) order route → RPC payload snapshot", () => {
  const route = readFileSync(join(root, "app/api/me/store-orders/route.ts"), "utf8");

  it("snapshot flag is on (RPC 20270604110100 writes the columns)", () => {
    expect(STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY).toBe(true);
  });

  it("route spreads the serviceability snapshot into the createStoreOrderAtomic order payload", () => {
    const rpc = route.indexOf("await createStoreOrderAtomic(sb");
    const linesIdx = route.indexOf("lines: lines.map(", rpc);
    const orderChunk = route.slice(rpc, linesIdx);
    expect(orderChunk).toContain(
      "...(serviceabilitySnapshot && STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY ? serviceabilitySnapshot : {})"
    );
    for (const k of [
      "checkout_store_latitude: storeLat",
      "checkout_store_longitude: storeLng",
      "checkout_serviceability_eligible: svc.eligible",
      "checkout_serviceability_max_km: svc.maxKm",
      "checkout_serviceability_reason: svc.reason",
    ]) {
      expect(route).toContain(k);
    }
  });

  it("route no longer writes the snapshot with a separate post-RPC UPDATE", () => {
    expect(route).not.toMatch(/\.update\(serviceabilitySnapshot\)/);
  });

  it("RPC migration INSERTs the 5 snapshot columns from p_order", () => {
    const mig = readFileSync(
      join(root, "supabase/migrations/20270604110100_create_store_order_atomic_ops08_loc004.sql"),
      "utf8"
    );
    for (const c of [
      "checkout_store_latitude",
      "checkout_store_longitude",
      "checkout_serviceability_eligible",
      "checkout_serviceability_max_km",
    ]) {
      expect(mig).toContain(`jsonb_typeof(p_order->'${c}')`);
    }
    expect(mig).toContain("nullif(p_order->>'checkout_serviceability_reason', '')");
  });
});

describe("LOC-004 (b) store move keeps order-time distances", () => {
  it("storeOrderCheckoutEtaOnlyPatch drops straight/route distance keys", () => {
    const patch = storeOrderCheckoutEtaOnlyPatch({
      checkout_prep_minutes: 20,
      checkout_ride_minutes: 10,
      checkout_eta_minutes: 30,
      checkout_eta_computed_at: "2026-10-21T00:00:00.000Z",
      checkout_route_distance_meters: 2400,
      checkout_straight_distance_meters: 1800,
    });
    expect(patch).toEqual({
      checkout_prep_minutes: 20,
      checkout_ride_minutes: 10,
      checkout_eta_minutes: 30,
      checkout_eta_computed_at: "2026-10-21T00:00:00.000Z",
    });
  });

  it("refresh after store move updates in-progress delivery orders without distance columns", async () => {
    const updates: Record<string, unknown>[] = [];
    const sb = {
      from: (table: string) => {
        const api: Record<string, unknown> = {
          select: () => api,
          eq: () => api,
          in: async () => ({
            data: [{ id: "o1", buyer_user_id: "b1", delivery_latitude: 14.6, delivery_longitude: 121.0 }],
            error: null,
          }),
          maybeSingle: async () =>
            table === "stores"
              ? { data: { lat: 14.55, lng: 121.02, business_hours_json: { prep_minutes: 20 } }, error: null }
              : { data: null, error: null },
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
        return api;
      },
    };
    const res = await refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged(sb as never, "store-1");
    expect(res).toEqual({ orders_updated: 1, errors: [] });
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toHaveProperty("checkout_straight_distance_meters");
    expect(updates[0]).not.toHaveProperty("checkout_route_distance_meters");
    expect(updates[0]).toHaveProperty("checkout_prep_minutes");
  });
});
