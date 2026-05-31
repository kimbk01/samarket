import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("owner store order review architecture", () => {
  it("loads review via shared parsed JSON fetch (not Response body reuse)", () => {
    const fetchMod = readRepo("lib/business/fetch-owner-store-order-detail.ts");
    expect(fetchMod).toContain("normalizeOwnerStoreOrderReviewDetail");
    expect(fetchMod).toContain("fetchOwnerStoreOrderDetailDeduped");
    expect(fetchMod).toContain("await res.json()");
    expect(fetchMod).not.toMatch(/return\s+fetch\(/);

    const hook = readRepo("components/business/owner/use-owner-store-order-review-load.ts");
    expect(hook).toContain("fetchOwnerStoreOrderDetailDeduped");
    expect(hook).not.toContain("runSingleFlight");

    const block = readRepo("components/business/owner/OwnerStoreOrderReviewBlock.tsx");
    expect(block).not.toContain("runSingleFlight");
    expect(block).not.toContain("fetchOwnerStoreOrderDetailDeduped");
    expect(block).toContain("store_owner_order_review_pending");
  });

  it("MockCard wires hook into presentational review block", () => {
    const card = readRepo("components/business/owner/OwnerStoreOrderMockCard.tsx");
    expect(card).toContain("useOwnerStoreOrderReviewLoad");
    expect(card).toContain("review={orderReview}");
    expect(card).toContain("loadErr={reviewLoadErr}");
    expect(card).toContain("store_owner_order_review_card_badge_aria");
  });

  it("enrichOrder shares the same deduped detail fetch", () => {
    const view = readRepo("components/business/owner/OwnerStoreOrdersView.tsx");
    expect(view).toContain("fetchOwnerStoreOrderDetailDeduped");
    expect(view).not.toMatch(/runSingleFlight\(\s*[`'"]owner:store-order-detail/);
  });
});

describe("owner store order review meta contract", () => {
  it("queries store_reviews without created_at order clause", () => {
    const meta = readRepo("lib/stores/owner-store-order-review-meta.ts");
    expect(meta).toContain("selectOwnerReviewRow");
    expect(meta).not.toMatch(/\.order\(\s*["']created_at["']/);
  });
});
