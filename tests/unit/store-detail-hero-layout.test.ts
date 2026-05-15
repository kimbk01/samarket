import { describe, expect, it } from "vitest";
import {
  storeDetailHeroMediaBoxStyle,
  STORE_DETAIL_HERO_MIN_HEIGHT_PX,
} from "@/lib/dibay/store-detail-hero-layout";

describe("store-detail-hero-layout", () => {
  it("uses consistent clamp box for hero media", () => {
    const base = storeDetailHeroMediaBoxStyle(0);
    expect(base.minHeight).toBe(`${STORE_DETAIL_HERO_MIN_HEIGHT_PX}px`);
    expect(base.height).toContain("clamp(13rem, 44vh, 18rem)");

    const stretched = storeDetailHeroMediaBoxStyle(24);
    expect(stretched.minHeight).toBe(`${STORE_DETAIL_HERO_MIN_HEIGHT_PX + 24}px`);
    expect(stretched.height).toContain("+ 24px");
  });
});
