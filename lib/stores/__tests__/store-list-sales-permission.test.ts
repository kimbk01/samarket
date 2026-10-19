import { describe, expect, it } from "vitest";
import {
  flattenStoreListSalesPermission,
  resolveStoreListSalesAllowedFromEmbed,
  STORE_LIST_SALES_PERMISSION_EMBED,
} from "@/lib/stores/store-list-sales-permission";
import {
  resolveStoreDiscoveryBrowseDisplayStatus,
  resolveStoreDiscoveryEligibility,
  resolveStoreDiscoveryHomeDisplayStatus,
} from "@/lib/stores/store-discovery-eligibility";
import { mapBrowseEmbedRows } from "@/lib/stores/stores-browse-build";

const OPEN_STORE = {
  business_hours_json: null,
  is_open: true,
  delivery_available: true,
  now: new Date("2026-10-19T04:00:00Z"),
};

describe("DEF-70 store list sales permission", () => {
  it("uses a LEFT embed (no !inner) so suspended stores are not dropped", () => {
    expect(STORE_LIST_SALES_PERMISSION_EMBED).not.toContain("!inner");
    expect(STORE_LIST_SALES_PERMISSION_EMBED).toContain("store_sales_permissions");
  });

  it("matches checkout RPC semantics: only allowed_to_sell + approved can sell", () => {
    expect(resolveStoreListSalesAllowedFromEmbed({ allowed_to_sell: true, sales_status: "approved" })).toBe(true);
    expect(resolveStoreListSalesAllowedFromEmbed([{ allowed_to_sell: true, sales_status: "approved" }])).toBe(true);
    expect(resolveStoreListSalesAllowedFromEmbed({ allowed_to_sell: false, sales_status: "suspended" })).toBe(false);
    expect(resolveStoreListSalesAllowedFromEmbed({ allowed_to_sell: true, sales_status: "pending" })).toBe(false);
    expect(resolveStoreListSalesAllowedFromEmbed(null)).toBe(false);
    expect(resolveStoreListSalesAllowedFromEmbed([])).toBe(false);
  });

  it("flattens the embed and is idempotent on already-flattened rows", () => {
    const flat = flattenStoreListSalesPermission({
      id: "s1",
      store_sales_permissions: { allowed_to_sell: false, sales_status: "suspended" },
    });
    expect(flat).toEqual({ id: "s1", sales_allowed: false });
    expect(flattenStoreListSalesPermission(flat as Record<string, unknown>)).toEqual(flat);
    expect(flattenStoreListSalesPermission({ id: "snap" })).toEqual({ id: "snap" });
  });

  it("browse row mapping keeps sales_allowed across re-mapping", () => {
    const once = mapBrowseEmbedRows([
      {
        id: "s1",
        business_type: null,
        store_topics: null,
        store_sales_permissions: null,
      },
    ]);
    expect(once[0].sales_allowed).toBe(false);
    expect("store_sales_permissions" in once[0]).toBe(false);
    const twice = mapBrowseEmbedRows(once as unknown[]);
    expect(twice[0].sales_allowed).toBe(false);
  });

  it("sales-suspended open store renders like a closed store (not orderable, lowest rank)", () => {
    const suspended = { ...OPEN_STORE, sales_allowed: false };
    const el = resolveStoreDiscoveryEligibility(suspended);
    expect(el.orderable).toBe(false);
    expect(el.state).toBe("closed");
    expect(el.rank).toBe(resolveStoreDiscoveryEligibility({ ...OPEN_STORE, is_open: false }).rank);
    expect(resolveStoreDiscoveryBrowseDisplayStatus(suspended)).toBe("closed");
    expect(resolveStoreDiscoveryHomeDisplayStatus(suspended)).toBe("closed");
  });

  it("unknown sales permission (null/undefined) keeps existing behavior", () => {
    expect(resolveStoreDiscoveryEligibility({ ...OPEN_STORE, sales_allowed: null }).state).toBe(
      resolveStoreDiscoveryEligibility(OPEN_STORE).state
    );
    expect(resolveStoreDiscoveryEligibility({ ...OPEN_STORE, sales_allowed: true }).state).toBe(
      resolveStoreDiscoveryEligibility(OPEN_STORE).state
    );
  });
});
