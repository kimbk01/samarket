/**
 * PHASE 3 — DIBAY HOME composer slot → Baemin A-VIS pattern mapping.
 *
 * Decision rules:
 * - MATCH: semantic + anatomy align with measured/observed A-VIS evidence.
 * - PARTIAL: anatomy fits; only present DIBAY fields may render.
 * - NO_MATCH: no A-VIS pattern — do not invent Baemin UI; preserve generic rail/grid.
 *
 * Composer / discovery / ordering: HARD LOCK — this file is presentation-only.
 */

import type { StoresHomePresentationDecision, StoresHomePresentationPatternId } from "./stores-home-presentation-spec";

export type StoresHomeSlotId =
  | "slot0Food"
  | "slot1Stores"
  | "slot2Food"
  | "newStoreFood"
  | "campaignFood"
  | "slot3Food"
  | "slot4Food"
  | "slot5Food"
  | "slot6NearbyStores"
  | "slot6RestStores";

export type StoresHomePresentationMapRow = {
  slot: StoresHomeSlotId;
  dibayDataAuthority: string;
  baeminAvisPattern: string;
  matchEvidence: string;
  decision: StoresHomePresentationDecision;
  patternId: StoresHomePresentationPatternId;
  componentOwner: string;
  notes: string;
};

/** Frozen mapping — Owner CLOSE reference for CUT C. */
export const STORES_HOME_PRESENTATION_MAP: readonly StoresHomePresentationMapRow[] = [
  {
    slot: "slot0Food",
    dibayDataAuthority:
      "owner_representative product: imageUrl, name, price, storeName, etaLabel, rating, deliveryFeeLabel, optional delivery_fee_strike",
    baeminAvisPattern: "§3.6 Food / product horizontal card",
    matchEvidence: "OBSERVED product image + name + store line + price (owner-stepA-home-scroll-02)",
    decision: "MATCH",
    patternId: "food_horizontal",
    componentOwner: "StoresHomeFoodRailCard",
    notes: "Open-now food rail; strike shown as formatted fee only — not instant-discount badge.",
  },
  {
    slot: "slot1Stores",
    dibayDataAuthority:
      "StoreHomeFeedItem: profileImageUrl, name, rating, reviewCount, commerce min/fee/eta, optional strike, distanceKm",
    baeminAvisPattern: "§3.1 Timesale vertical store list (left thumb + meta column)",
    matchEvidence: "MEASURED 75.1×71.2 thumb; vertical stacked rows (home-scroll-00)",
    decision: "PARTIAL",
    patternId: "timesale_vertical",
    componentOwner: "StoresHomeTimesaleRowCard",
    notes:
      "Vertical store rows match; DIBAY lacks Baemin product-discount strings — strike/fee only. No 116px menu band (≠ CATEGORY).",
  },
  {
    slot: "slot2Food",
    dibayDataAuthority:
      "platform_popular product when qualified else owner_representative; menuAuthority flag",
    baeminAvisPattern: "§3.6 Food horizontal (no A-VIS “popular shelf” pattern)",
    matchEvidence: "Product-card anatomy only — platform_popular is DIBAY authority label, not Baemin pattern name",
    decision: "PARTIAL",
    patternId: "food_horizontal",
    componentOwner: "StoresHomeFoodRailCard",
    notes: "Do not label as Baemin Popular; show platform_popular badge only when menuAuthority proves it.",
  },
  {
    slot: "newStoreFood",
    dibayDataAuthority: "firstListedAt new-store signal + owner_representative product",
    baeminAvisPattern: "none for HOME new-store food rail",
    matchEvidence: "A-VIS §8 신규 badge is CATEGORY context — not HOME food rail",
    decision: "NO_MATCH",
    patternId: "food_horizontal",
    componentOwner: "StoresHomeFoodRailCard",
    notes: "Preserve generic food rail; no invented 신규 Baemin HOME card.",
  },
  {
    slot: "campaignFood",
    dibayDataAuthority: "discoveryCampaign.title/type + owner_representative product",
    baeminAvisPattern: "§3.4 Brand discount rail (circular logo + discount subtitle)",
    matchEvidence: "Brand rail requires brand logo — DIBAY has product + campaign copy only",
    decision: "NO_MATCH",
    patternId: "food_horizontal",
    componentOwner: "StoresHomeFoodRailCard",
    notes: "Show campaignTitle when present (real data); do not claim brand-rail parity.",
  },
  {
    slot: "slot3Food",
    dibayDataAuthority: "deliveryFeeStrikePhp evidence required for shelf admission",
    baeminAvisPattern: "§3.6 Food horizontal; discount overlay OBSERVED on some HOME food frames",
    matchEvidence: "Strike amount is DIBAY fee authority — not Baemin % discount badge",
    decision: "PARTIAL",
    patternId: "food_horizontal",
    componentOwner: "StoresHomeFoodRailCard",
    notes: "Remove fake instant-discount adHint; render strike php when discountEvidence present.",
  },
  {
    slot: "slot4Food",
    dibayDataAuthority: "rating≥4 & reviews≥3 + owner_representative product",
    baeminAvisPattern: "§3.5 High-rating horizontal shelf (large food image + meta)",
    matchEvidence: "OBSERVED 평점 4.9점 shelf + large landscape food cards (owner-stepA-home-scroll-03)",
    decision: "PARTIAL",
    patternId: "high_rating_horizontal",
    componentOwner: "StoresHomeHighRatingFoodCard",
    notes: "Larger horizontal food card; rating emphasis — exact overlay NOT_PROVEN.",
  },
  {
    slot: "slot5Food",
    dibayDataAuthority: "isFeatured store filter + owner_representative product",
    baeminAvisPattern: "none — editorial §3.7 card geometry NOT_PROVEN",
    matchEvidence: "No A-VIS featured-grid pattern",
    decision: "NO_MATCH",
    patternId: "preserved_legacy",
    componentOwner: "StoresHomeFoodRailCard",
    notes: "Preserve 2-col grid food card; no Baemin claim.",
  },
  {
    slot: "slot6NearbyStores",
    dibayDataAuthority: "distanceKm sort + StoreHomeFeedItem store fields",
    baeminAvisPattern: "§3.1 Timesale vertical (nearest vertical store list)",
    matchEvidence: "Vertical store rows — same anatomy class as slot1",
    decision: "PARTIAL",
    patternId: "timesale_vertical",
    componentOwner: "StoresHomeTimesaleRowCard",
    notes: "Not CATEGORY card; not horizontal teaser.",
  },
  {
    slot: "slot6RestStores",
    dibayDataAuthority: "remaining stores after exposure roles",
    baeminAvisPattern: "§3.1 Timesale vertical",
    matchEvidence: "Vertical store list remainder",
    decision: "PARTIAL",
    patternId: "timesale_vertical",
    componentOwner: "StoresHomeTimesaleRowCard",
    notes: "Same timesale row as slot1/nearby.",
  },
] as const;

export function storesHomePresentationRow(
  slot: StoresHomeSlotId
): StoresHomePresentationMapRow {
  const row = STORES_HOME_PRESENTATION_MAP.find((r) => r.slot === slot);
  if (!row) throw new Error(`storesHomePresentationRow: unknown slot ${slot}`);
  return row;
}
