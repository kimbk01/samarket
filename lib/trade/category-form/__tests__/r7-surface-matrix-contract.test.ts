/**
 * R7 — 6-category WRITE → LIST → DETAIL → EDIT → CTA composition matrix (contract).
 * Runtime browser matrix is separate; this locks SSOT wiring in-repo.
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
import { hydrateTradeWriteFormFromSnapshot } from "@/lib/posts/apply-owner-snapshot-to-trade-write-form";
import type { TradeCompositionProfileId } from "@/lib/trade/category-form/types";

const PROFILES: TradeCompositionProfileId[] = [
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

describe("R7 composition matrix (6 profiles)", () => {
  it("seeds cover exactly the six Admin categories", () => {
    expect(Object.keys(TRADE_SEED_COMPOSITIONS).sort()).toEqual([...PROFILES].sort());
  });

  it.each(PROFILES)("%s: write/list/detail/edit surfaces resolve from seed", (profileId) => {
    const composition = resolveTradeComposition({ icon_key: profileId, fieldComposition: null });
    expect(composition.profileId).toBe(profileId);
    expect(composition.source).toBe("product_seed");
    for (const surface of ["write", "list", "detail", "edit", "filter"] as const) {
      expect(
        compositionFieldsForSurface(composition, surface).length,
        `${profileId}.${surface}`
      ).toBeGreaterThan(0);
    }
  });

  it.each(PROFILES)("%s: Admin overlay reaches resolve (list/detail/edit authority)", (profileId) => {
    const seed = TRADE_SEED_COMPOSITIONS[profileId];
    const first = seed.fields[0];
    expect(first).toBeTruthy();
    const composition = resolveTradeComposition({
      icon_key: profileId,
      fieldComposition: {
        v: 1,
        fields: [{ id: first.id, active: true, required: true, order: 1 }],
      },
    });
    expect(composition.source).toBe("db_overlay");
    expect(composition.fields.map((f) => f.id)).toEqual([first.id]);
  });

  it("CTA policy matrix: general/used-car/RE/exchange chat; rent-car inquire; jobs hire apply", () => {
    expect(
      resolveTradeDetailCtaPolicy({ ...CTA_BASE, compositionProfileId: "general" }).primary
    ).toMatchObject({ kind: "chat", labelKey: "trade_detail_chat_cta" });
    expect(
      resolveTradeDetailCtaPolicy({ ...CTA_BASE, compositionProfileId: "used-car" }).primary
    ).toMatchObject({ kind: "chat", labelKey: "trade_detail_chat_cta" });
    expect(
      resolveTradeDetailCtaPolicy({ ...CTA_BASE, compositionProfileId: "real-estate" }).primary
    ).toMatchObject({ kind: "chat", labelKey: "trade_detail_chat_cta" });
    expect(
      resolveTradeDetailCtaPolicy({ ...CTA_BASE, compositionProfileId: "exchange" }).primary
    ).toMatchObject({ kind: "chat", labelKey: "trade_detail_chat_cta" });
    expect(
      resolveTradeDetailCtaPolicy({ ...CTA_BASE, compositionProfileId: "rent-car" }).primary
    ).toMatchObject({ kind: "chat", labelKey: "trade_detail_inquire_cta" });
    expect(
      resolveTradeDetailCtaPolicy({
        ...CTA_BASE,
        isJobsDetailUi: true,
        jobDirection: "hiring",
        listingKind: "hire",
        compositionProfileId: "jobs",
      }).primary
    ).toMatchObject({ kind: "job_apply_chat", labelKey: "trade_detail_inquire_cta" });
  });

  it("EDIT entry == WRITE entry (ProductTradeEdit → TradeCategoryWriteForm → TradeWriteForm)", () => {
    const editClient = readFileSync(
      resolve(process.cwd(), "components/products/ProductTradeEditPageClient.tsx"),
      "utf8"
    );
    const categoryWrite = readFileSync(
      resolve(process.cwd(), "components/write/trade/TradeCategoryWriteForm.tsx"),
      "utf8"
    );
    const tradeWrite = readFileSync(
      resolve(process.cwd(), "components/write/trade/TradeWriteForm.tsx"),
      "utf8"
    );
    expect(editClient).toContain("TradeCategoryWriteForm");
    expect(editClient).not.toMatch(/JobsWriteForm|ExchangeWriteForm/);
    expect(categoryWrite).toContain("TradeWriteForm");
    expect(categoryWrite).not.toMatch(/JobsWriteForm|ExchangeWriteForm|JobsExtendedWriteFields|ExchangeExtendedWriteFields/);
    expect(tradeWrite).not.toMatch(/from ["']\.\/JobsWriteForm["']/);
    expect(tradeWrite).not.toMatch(/from ["']\.\/ExchangeWriteForm["']/);
    expect(tradeWrite).not.toContain("resolveUsesJobsTradeWriteForm");
    expect(tradeWrite).not.toContain("resolveUsesExchangeTradeWriteForm");
    expect(tradeWrite).not.toContain('if (compositionProfileId === "jobs")');
    expect(tradeWrite).not.toContain('if (compositionProfileId === "exchange")');
    expect(tradeWrite).toContain('const isJobsProfile = tradeComposition.profileId === "jobs"');
    expect(tradeWrite).toContain('const isExchangeProfile = tradeComposition.profileId === "exchange"');
    expect(tradeWrite).toContain("registerController={registerJobsController}");
    expect(tradeWrite).toContain("registerController={registerExchangeController}");
    expect(tradeWrite).toContain("chrome={extendedChrome}");
    expect(tradeWrite).toContain("extendedChromeSlots.topic");
    expect(tradeWrite).not.toContain("slots={extendedChromeSlots}");
  });

  it("EDIT hydrate rent-car restores composition meta (CREATE == EDIT)", () => {
    const h = hydrateTradeWriteFormFromSnapshot("rent-car", {
      id: "p1",
      title: "Vios rental",
      content: "Daily rental",
      price: 2500,
      region: "ceb",
      city: "ceb",
      images: ["https://example.com/a.jpg"],
      is_free_share: false,
      is_price_offer: false,
      trade_category_id: "cat-rent",
      meta: {
        car_model: "Toyota Vios",
        car_year: "2021",
        mileage_cap: "200",
        with_driver: true,
        pickup_location: "IT Park",
        available_from: "2026-09-01",
        deposit: "5000",
        transmission: "automatic",
      },
    } as never);
    expect(h.carModel).toBe("Toyota Vios");
    expect(h.carYear).toBe("2021");
    expect(h.price).toMatch(/2,?500/);
    expect(h.mileageCap).toMatch(/200/);
    expect(h.withDriver).toBe(true);
    expect(h.pickupLocation).toBe("IT Park");
    expect(h.availableFrom).toBe("2026-09-01");
    expect(h.deposit).toMatch(/5,?000/);
    expect(h.transmission).toBe("automatic");
  });

  it("profile id bridge covers Admin 6 icon_key/slug aliases", () => {
    expect(resolveTradeCompositionProfileId({ icon_key: "general" })).toBe("general");
    expect(resolveTradeCompositionProfileId({ icon_key: "used-car" })).toBe("used-car");
    expect(resolveTradeCompositionProfileId({ icon_key: "car" })).toBe("used-car");
    expect(resolveTradeCompositionProfileId({ icon_key: "real-estate" })).toBe("real-estate");
    expect(resolveTradeCompositionProfileId({ icon_key: "jobs" })).toBe("jobs");
    expect(resolveTradeCompositionProfileId({ slug: "current" })).toBe("exchange");
    expect(resolveTradeCompositionProfileId({ icon_key: "rent-car" })).toBe("rent-car");
    expect(resolveTradeCompositionProfileId({ slug: "rental-car" })).toBe("rent-car");
  });
});
