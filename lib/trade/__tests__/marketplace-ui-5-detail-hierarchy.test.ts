import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function slotIndex(haystack: string, slot: string): number {
  return haystack.indexOf(`data-ui5-slot="${slot}"`);
}

describe("marketplace UI-5 DETAIL visual hierarchy", () => {
  it("document flow is photo → price → title → location → item → description → seller → actions → discovery", () => {
    const view = src("components/post/PostDetailView.tsx");
    const slots = [
      "photos",
      "price",
      "title",
      "location",
      "item",
      "description",
      "seller",
      "actions",
      "discovery",
    ];
    const idx = slots.map((s) => slotIndex(view, s));
    for (const i of idx) expect(i).toBeGreaterThan(-1);
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i]).toBeGreaterThan(idx[i - 1]);
    }
  });

  it("does not keep status/intent chips between title and location", () => {
    const view = src("components/post/PostDetailView.tsx");
    const title = slotIndex(view, "title");
    const location = slotIndex(view, "location");
    const item = slotIndex(view, "item");
    const between = view.slice(title, location);
    expect(between).not.toContain("getCarTradeLabel");
    expect(between).not.toContain("TradeListingStatusBadge");
    expect(between).not.toContain("JobDetailTypeStatusChips");
    const facts = view.slice(item, slotIndex(view, "description"));
    expect(facts).toContain("getCarTradeLabel");
    expect(facts).toContain("TradeListingStatusBadge");
    expect(facts).toContain("JobDetailTypeStatusChips");
  });

  it("real estate keeps item facts before description and uses a dedicated location slot", () => {
    const view = src("components/post/PostDetailView.tsx");
    expect(view.indexOf("TradeCompositionDetailSection")).toBeGreaterThan(-1);
    expect(view.indexOf("TradeCompositionDetailSection")).toBeLessThan(slotIndex(view, "description"));
    expect(view).not.toContain("!isRealEstateSpec && listingLocationLine");
  });

  it("buyer primary actions are after seller; sticky bar does not host favorite", () => {
    const view = src("components/post/PostDetailView.tsx");
    expect(slotIndex(view, "actions")).toBeGreaterThan(slotIndex(view, "seller"));
    expect(slotIndex(view, "discovery")).toBeGreaterThan(slotIndex(view, "actions"));
    const bar = view.slice(view.indexOf("function TradePostDetailActionBar"), view.indexOf("function PostDetailSellerPromoButtons"));
    expect(bar).not.toContain("TRADE_POST_DETAIL_BOTTOM_FAVORITE_BTN");
    expect(bar).not.toContain("onFavorite");
    expect(view).toContain("promoteBuyerPrimaryActions");
    expect(view).toContain("shareEnabled={!promoteBuyerPrimaryActions}");
  });

  it("does not change related loader or CUT G writers", () => {
    const view = src("components/post/PostDetailView.tsx");
    expect(view).toContain("relatedSectionsSlot");
    expect(view).toContain("toggleFavorite");
    expect(view).toContain("ReportReasonModal");
    expect(view).toContain("shareOrCopyTradeListing");
    const related = src("app/(main)/post/[id]/post-detail-related-deferred.tsx");
    expect(related).toContain("getTradeDetailRelatedData");
  });

  it("jobs extras no longer render description before location facts", () => {
    const extras = src("components/jobs/JobsExtendedDetailExtras.tsx");
    expect(extras).not.toContain("ui_jobs_detail_description_heading");
    expect(extras).not.toContain("ui_jobs_detail_intro_heading");
    const header = src("components/jobs/JobDetailHeader.tsx");
    expect(header).toContain("data-ui5-slot=\"price\"");
    expect(header).toContain("data-ui5-slot=\"title\"");
    expect(header).toContain("JobDetailTypeStatusChips");
  });
});
