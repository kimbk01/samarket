/**
 * §4 EXTEND — 7th category anti-fork contract.
 * New profiles must resolve via Library±Seed±Overlay without new WriteForm / Detail MetaBlock forks.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TRADE_SEED_COMPOSITIONS,
  resolveTradeCompositionProfileId,
} from "@/lib/trade/category-form/composition-seeds";
import {
  compositionFieldsForSurface,
  resolveTradeComposition,
} from "@/lib/trade/category-form/resolve-composition";
import { resolveTradeDetailCtaPolicy } from "@/lib/trade/category-form/cta-policy";
import { TRADE_FIELD_LIBRARY } from "@/lib/trade/category-form/field-library";
import type { TradeCompositionProfileId } from "@/lib/trade/category-form/types";

const KNOWN: TradeCompositionProfileId[] = [
  "general",
  "used-car",
  "real-estate",
  "jobs",
  "exchange",
  "rent-car",
];

const CTA_BASE = {
  isOwnPost: false,
  postStatusLower: "active",
  categoryHasChat: true,
  buyerPriceOfferFlowActive: false,
  hasAcceptedOffer: false,
  isJobsDetailUi: false,
  jobDirection: "unknown" as const,
  listingKind: "",
  existingTradeRoomId: null as string | null,
  priceOfferGatesChat: false,
};

describe("7th category anti-fork (§4 EXTEND)", () => {
  it("every seed profile resolves WRITE/LIST/DETAIL surfaces without a dedicated WriteForm file", () => {
    for (const profileId of KNOWN) {
      const seed = TRADE_SEED_COMPOSITIONS[profileId];
      expect(seed, profileId).toBeTruthy();
      const composition = resolveTradeComposition({
        icon_key: profileId,
        slug: profileId,
        fieldComposition: null,
      });
      expect(composition.profileId).toBe(profileId);
      expect(composition.layoutVariant).toBeTruthy();
      expect(compositionFieldsForSurface(composition, "write").length).toBeGreaterThan(0);
      expect(compositionFieldsForSurface(composition, "list").length).toBeGreaterThan(0);
      expect(compositionFieldsForSurface(composition, "detail").length).toBeGreaterThan(0);
    }
  });

  it("TradeWriteForm accepts profiles via Generic + bounded Extended only (no NewFooWriteForm)", () => {
    const writeForm = readFileSync(
      resolve(process.cwd(), "components/write/trade/TradeWriteForm.tsx"),
      "utf8"
    );
    const entry = readFileSync(
      resolve(process.cwd(), "components/write/trade/TradeCategoryWriteForm.tsx"),
      "utf8"
    );
    expect(entry).toContain("TradeWriteForm");
    expect(entry).not.toMatch(/from ["'][^"']*JobsWriteForm["']/);
    expect(entry).not.toMatch(/from ["'][^"']*ExchangeWriteForm["']/);
    expect(writeForm).toContain("GenericTradeWriteFields");
    expect(writeForm).toContain("JobsExtendedWriteFields");
    expect(writeForm).toContain("ExchangeExtendedWriteFields");
    expect(writeForm).not.toMatch(/from ["']\.\/[A-Z][A-Za-z]+WriteForm["']/);
  });

  it("DETAIL projector module exists; formatters live in Product authority module", () => {
    const detail = readFileSync(
      resolve(process.cwd(), "components/post/TradeCompositionDetailSection.tsx"),
      "utf8"
    );
    expect(detail).toContain("resolveTradeComposition");
    expect(detail).toContain("buildCompositionDetailAttributes");
    const postDetail = readFileSync(
      resolve(process.cwd(), "components/post/PostDetailView.tsx"),
      "utf8"
    );
    expect(postDetail).toContain("TradeCompositionDetailSection");
    expect(postDetail).toContain("resolveDetailSpecProfileId");
    expect(postDetail).not.toContain("function UsedCarMetaBlock");
    expect(postDetail).not.toContain("function TradeMetaBlock");
    const formatters = readFileSync(
      resolve(process.cwd(), "lib/trade/category-form/detail-field-formatters.ts"),
      "utf8"
    );
    expect(formatters).toContain("formatUsedCarCompositionDetailField");
    expect(formatters).toContain("formatExchangeCompositionDetailField");
    expect(formatters).toContain("formatCompositionDetailField");
  });

  it("LIST layoutVariant comes from resolve for rent-car ≠ used-car", () => {
    const rent = resolveTradeComposition({
      icon_key: "rent-car",
      slug: "rent-car",
      fieldComposition: null,
    });
    const used = resolveTradeComposition({
      icon_key: "used-car",
      slug: "used-car",
      fieldComposition: null,
    });
    expect(rent.layoutVariant).toBe("rental-card");
    expect(used.layoutVariant).toBe("vehicle-card");
    expect(resolveTradeCompositionProfileId({ icon_key: "rent-car" })).toBe("rent-car");
  });

  it("EDIT/CTA policy resolves for every known profile", () => {
    for (const profileId of KNOWN) {
      const cta = resolveTradeDetailCtaPolicy({
        ...CTA_BASE,
        isJobsDetailUi: profileId === "jobs",
      });
      expect(cta, profileId).toBeTruthy();
      expect(cta.role).toBe("buyer");
    }
  });

  it("Admin overlay active:false drops field from write surface (Product widget unchanged)", () => {
    const overlay = resolveTradeComposition({
      icon_key: "general",
      slug: "general",
      fieldComposition: {
        v: 1,
        fields: [
          { id: "price", active: true, required: true, order: 10 },
          { id: "title", active: false, required: false, order: 20 },
        ],
      },
    });
    expect(overlay.source).toBe("db_overlay");
    expect(overlay.fields.map((f) => f.id)).toEqual(["price"]);
    expect(TRADE_FIELD_LIBRARY.title?.widget).toBeTruthy();
  });
});
