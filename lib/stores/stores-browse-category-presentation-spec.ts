/**
 * BAEMIN A-VIS CATEGORY LIST presentation authority.
 *
 * Source: `docs/dibay-stores-baemin-visual-ssot-a-vis.md` §4–§6.5
 * NOT the disproven old CUT B (56px left thumb + 40px menu peek).
 */
export const STORES_BROWSE_CATEGORY_PRESENTATION = {
  authorityDoc: "docs/dibay-stores-baemin-visual-ssot-a-vis.md",
  anatomy: [
    "menu_band",
    "promo_bar_optional",
    "store_identity",
    "metadata",
    "badges",
  ] as const,
  /** @390px MEASURED — sample rows A/B */
  rowHeightPx: { sampleA: 175, sampleB: 136.5 },
  /** 사진이 하나도 없을 때 「더보기」 단독 버튼 높이 (기존 밴드 높이 유지) */
  menuBandHeightPx: 90.7,
  /**
   * WP5 (2026-10-29 배민형 2차수) — 4칸 고정 그리드 → 가로 스크롤 사진 줄.
   * 최대 6장 + 마지막 「더보기」 타일. 데이터 상한 `BROWSE_FEATURED_ITEMS_MAX` 와 같은 값.
   */
  menuTileVisibleCount: 6,
  /** WP5 사진 줄 — 4:3, 폭 = (카드 폭 − 16px) ÷ 3.2, 사진 사이 1.5px, 줄 바깥 모서리만 4px */
  menuStrip: {
    aspectRatio: "4 / 3",
    perViewport: 3.2,
    leadingInsetPx: 16,
    gapPx: 1.5,
    outerRadiusPx: 4,
  },
  menuTileWidthPx: 93.6,
  menuTileHeightPx: 79.5,
  menuTileGapPx: 0.5,
  /** PNG pixel estimate — not Baemin brand-locked hex/radius claim */
  menuTileRadiusPx: 2.9,
  promoBarHeightPx: 31.2,
  contentInsetPx: 10,
  interCardDividerPx: 15.6,
  typographyBoundsPx: {
    storeName: 14.6,
    metadata: 12.7,
    badge: 9.3,
  },
  notProvenNonBlockers: ["font_family", "exact_hex", "category_third_row"] as const,
} as const;

export type StoresBrowseCategoryPresentationAnatomy =
  (typeof STORES_BROWSE_CATEGORY_PRESENTATION.anatomy)[number];
