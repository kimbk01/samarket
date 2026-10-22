import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveOwnerBannerCtaHref } from "@/lib/stores/advertising/owner-banner-contract";
import {
  resolveStoreDetailCtaEntryTarget,
  STORE_DETAIL_PROMO_ANCHOR_ID,
} from "@/lib/stores/store-detail-cta-entry-target";

function entryOf(href: string) {
  const u = new URL(href, "https://dibay.test");
  return resolveStoreDetailCtaEntryTarget({ search: u.search, hash: u.hash });
}

describe("ADC-06 — store detail handles banner/popup CTA landing", () => {
  it("maps the CTA hrefs the banner contract produces", () => {
    expect(entryOf(resolveOwnerBannerCtaHref({ ctaType: "store_menu", storeSlug: "a" }))).toBe("menu");
    expect(entryOf(resolveOwnerBannerCtaHref({ ctaType: "store_promotion", storeSlug: "a" }))).toBe(
      "promo"
    );
    expect(entryOf(resolveOwnerBannerCtaHref({ ctaType: "store_detail", storeSlug: "a" }))).toBeNull();
  });

  it("focusProduct entry keeps the existing menu-focus path", () => {
    expect(entryOf("/stores/a?focusProduct=p1#menu")).toBeNull();
    expect(entryOf("/stores/a?tab=reviews")).toBeNull();
  });

  it("store detail wires the entry to the existing section scroll + promo anchor", () => {
    const src = readFileSync("components/stores/StoreDetailPublic.tsx", "utf8");
    expect(src).toContain("resolveStoreDetailCtaEntryTarget({");
    expect(src).toContain("scrollStoreSectionIntoView(0)");
    expect(src).toContain("<div id={STORE_DETAIL_PROMO_ANCHOR_ID}>");
    expect(STORE_DETAIL_PROMO_ANCHOR_ID).toBe("store-detail-promo");
  });
});
