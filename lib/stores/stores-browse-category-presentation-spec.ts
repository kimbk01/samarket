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
  menuBandHeightPx: 90.7,
  menuTileVisibleCount: 4,
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
