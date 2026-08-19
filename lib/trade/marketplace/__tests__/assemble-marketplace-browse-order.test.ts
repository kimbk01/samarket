import { describe, expect, it } from "vitest";
import {
  assembleMarketplaceBrowseLocationOrder,
  assembleMarketplaceBrowseOrder,
} from "@/lib/trade/marketplace/assemble-marketplace-browse-order";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";

describe("CUT-SSOT-4 assembleMarketplaceBrowseOrder", () => {
  it("puts within-anchor rows before outside rows", () => {
    const constraint = resolveTradeFeedLocationConstraint("1381200000", null);
    if (constraint.kind !== "lgu") return;
    const page = assembleMarketplaceBrowseOrder(
      [{ id: "a", trade_lgu_id: constraint.canonicalId, created_at: "2026-08-18T10:00:00.000Z" }],
      [{ id: "b", trade_lgu_id: "1376020000", created_at: "2026-08-18T11:00:00.000Z" }],
      "latest",
      constraint.canonicalId
    );
    expect(page.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("partitions nationwide batch then assembles L-SOFT order", () => {
    const constraint = resolveTradeFeedLocationConstraint("1381200000", null);
    if (constraint.kind !== "lgu") return;
    const ordered = assembleMarketplaceBrowseLocationOrder(
      [
        { id: "outside-new", trade_lgu_id: "1376020000", created_at: "2026-08-18T12:00:00.000Z" },
        { id: "within-old", trade_lgu_id: constraint.canonicalId, created_at: "2026-08-18T09:00:00.000Z" },
        { id: "within-new", trade_lgu_id: constraint.canonicalId, created_at: "2026-08-18T11:00:00.000Z" },
      ],
      constraint,
      "latest"
    );
    expect(ordered.map((r) => r.id)).toEqual(["within-new", "within-old", "outside-new"]);
  });
});
