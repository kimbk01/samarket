/**
 * HOME presentation geometry — A-VIS SSOT authority only.
 * `docs/dibay-stores-baemin-visual-ssot-a-vis.md` §3.1–§3.6
 *
 * NOT_PROVEN (non-blocker): font family · exact font weight · exact hex · some radii/gaps.
 */

export const STORES_HOME_PRESENTATION_SPEC = {
  authorityDoc: "docs/dibay-stores-baemin-visual-ssot-a-vis.md",
  patterns: {
    timesaleVertical: {
      avisSection: "3.1",
      thumbWidthPx: 75.1,
      thumbHeightPx: 71.2,
      thumbGapPx: 19.9,
      typographyBoundsPx: {
        sectionTitle: 16.6,
        rating: 12.7,
        meta: 12.7,
        discountMicro: 9.3,
      },
    },
    foodHorizontal: {
      avisSection: "3.6",
      typographyBoundsPx: { productName: 13.7, meta: 12.7 },
      imageGeometry: "NOT_PROVEN",
    },
    highRatingHorizontal: {
      avisSection: "3.5",
      teaserCardWidthPx: 126.8,
      teaserCardHeightPx: 86.8,
      imageGeometry: "OBSERVED_PARTIAL",
    },
    brandDiscountRail: {
      avisSection: "3.4",
      note: "circular brand logo + discount subtitle — not product food card",
    },
  },
  notProvenNonBlockers: ["font_family", "exact_font_weight", "exact_hex", "food_image_ratio"] as const,
} as const;

export type StoresHomePresentationPatternId =
  | "timesale_vertical"
  | "food_horizontal"
  | "high_rating_horizontal"
  | "preserved_legacy";

export type StoresHomePresentationDecision = "MATCH" | "PARTIAL" | "NO_MATCH";
