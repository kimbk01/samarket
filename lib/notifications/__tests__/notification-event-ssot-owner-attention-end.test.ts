import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("owner order status transition ends Notification Event attention", () => {
  it("applyStoreOrderStatusTransition calls markOrderNotificationsRead for owner", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/apply-store-order-status-transition.ts"),
      "utf8"
    );
    expect(src).toContain("markOrderNotificationsRead");
    expect(src).toContain("owner intake attention end");
  });

  it("owner Bell ack does not mass-clear owner commerce via PATCH mark_all", () => {
    const src = readFileSync(
      join(process.cwd(), "components/business/owner/OwnerStoreOrdersView.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/mark_all_owner_store_commerce_read\s*:\s*true/);
    expect(src).toContain("ack_owner_notifications");
    expect(src).toContain('readReason: "order_detail_opened"');
  });
});
