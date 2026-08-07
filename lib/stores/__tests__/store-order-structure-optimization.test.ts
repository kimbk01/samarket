import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("store order structure optimization contract", () => {
  it("owner list uses snapshot meta; invalidate coalesced; stock batched", () => {
    const orders = fs.readFileSync("app/api/me/stores/[storeId]/orders/route.ts", "utf8");
    const counts = fs.readFileSync("lib/stores/store-order-counts-cache.ts", "utf8");
    const restore = fs.readFileSync("lib/stores/restore-order-stock.ts", "utf8");
    const hub = fs.readFileSync(
      "lib/delivery/customer/load-buyer-store-orders-hub-summary.ts",
      "utf8"
    );

    expect(orders).toContain("statusCounts.pending_accept_count");
    expect(orders).not.toContain("countPromise");
    expect(counts).toContain("produced.via");
    expect(restore).toContain('.in("id", ids)');
    expect(hub).toContain("sumBuyerStoreOrderMessengerUnreadFromRoomIds");
  });
});
