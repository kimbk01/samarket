import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("owner orders deeplink contract", () => {
  it("OwnerStoreOrdersView handles fresh_list and does not strip order_id on tab mismatch", () => {
    const view = readRepo("components/business/owner/OwnerStoreOrdersView.tsx");
    expect(view).toContain("owner-orders-entry-policy");
    expect(view).toContain("OWNER_ORDERS_FRESH_LIST_PARAM");
    expect(view).toContain("orders_entry_fresh");
    expect(view).toContain("prevHighlightOrderIdRef");
    expect(view).toContain("freshListStrippedRef");
    expect(view).not.toMatch(
      /orderMatchesOwnerMobileOrdersTab\(order, tab\)[\s\S]{0,120}replaceOwnerOrdersUrlQuery\(\{ storeId: state\.storeId, tab \}\)/
    );
  });

  it("OwnerStoreOrdersView queues overlapping non-silent loads instead of dropping them", () => {
    const view = readRepo("components/business/owner/OwnerStoreOrdersView.tsx");
    expect(view).toContain("loadPendingRef");
    expect(view).toContain("stateKindRef.current === \"ok\"");
    expect(view).not.toMatch(/if \(loadInFlightRef\.current\) return;/);
  });

  it("hub orders refresh on orders route avoids forceNetwork refetch storm", () => {
    const view = readRepo("components/business/owner/OwnerStoreOrdersView.tsx");
    expect(view).toContain('forceNetwork: false, reason: "hub_orders_refresh"');
  });

  it("OwnerHubRuntimeProvider does not invalidate list cache on every UPDATE", () => {
    const hub = readRepo("components/business/owner/OwnerHubRuntimeProvider.tsx");
    expect(hub).toContain("store_orders_insert");
    expect(hub).not.toContain("store_orders_realtime_change");
  });

  it("dashboard urgent card uses entry href with fresh_list", () => {
    const card = readRepo("components/stores/owner/dashboard/OwnerUrgentOrdersCard.tsx");
    expect(card).toContain("buildOwnerOrdersEntryHref");
    expect(card).toContain("freshList: true");
  });
});
