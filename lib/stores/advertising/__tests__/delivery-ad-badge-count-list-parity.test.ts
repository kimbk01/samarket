/**
 * MASTER CONTRACT: Delivery Ads action queue COUNT === LIST (funding filter).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("Delivery Ads badge COUNT=LIST parity", () => {
  it("countDeliveryAdAdminActionQueue delegates to list with same funding filter", () => {
    const src = read("lib/stores/advertising/delivery-ad-operations-action-queue.ts");
    expect(src).toContain("COUNT QUERY === LIST QUERY");
    expect(src).toMatch(
      /countDeliveryAdAdminActionQueue[\s\S]*listDeliveryAdAdminActionQueue/
    );
    expect(src).toContain("deliveryAdAdminQueueFundingAllowsIntake");
    expect(src).not.toMatch(
      /countDeliveryAdAdminActionQueue[\s\S]*select\("id", \{ count: "exact"/
    );
  });

  it("admin-action-queue uses countDeliveryAdAdminActionQueue for delivery_ad_ops", () => {
    const aq = read("lib/admin/admin-action-queue.ts");
    expect(aq).toContain("countDeliveryAdAdminActionQueue");
    expect(aq).not.toMatch(
      /delivery_ad_operations_cases[\s\S]*count: "exact"[\s\S]*WAITING_ADMIN/
    );
  });
});
