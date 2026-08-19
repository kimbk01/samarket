/**
 * CUT-SSOT-3 — composition proximity signals (SIM-BOTH T3).
 * Profile-aware meta proximity — not TOPIC graph (T4).
 */
import type { SearchExpansionHints, SearchExpansionListing } from "@/lib/trade/marketplace/search-candidate-expansion";
import { normalizeSearchExpansionText } from "@/lib/trade/marketplace/search-candidate-expansion";

/** Meta keys per ROOT profile used for looser composition match (T3). */
const COMPOSITION_PROXIMITY_META_KEYS = [
  "car_body_type",
  "deal_type",
  "estate_type",
  "listing_kind",
  "work_category",
  "exchange_direction",
  "car_model",
] as const;

function listingMetaText(meta: Record<string, unknown> | null | undefined, key: string): string {
  if (!meta || typeof meta !== "object") return "";
  const value = meta[key];
  return typeof value === "string" ? normalizeSearchExpansionText(value) : "";
}

export function listingMatchesCompositionProximity(
  listing: SearchExpansionListing,
  hints: SearchExpansionHints,
  inferredBodyTypes: string[] = []
): boolean {
  const body = listingMetaText(listing.meta ?? null, "car_body_type");
  const allowedBodies = new Set([...hints.bodyTypes, ...inferredBodyTypes]);
  if (body && allowedBodies.has(body)) return true;

  for (const key of COMPOSITION_PROXIMITY_META_KEYS) {
    if (key === "car_body_type") continue;
    const metaVal = listingMetaText(listing.meta ?? null, key);
    if (!metaVal) continue;
    if (hints.metaCatalogMatches.some((m) => m.metaKey === key && metaVal === normalizeSearchExpansionText(m.value))) {
      return true;
    }
    if (hints.makes.some((make) => metaVal.includes(make))) return true;
    if (hints.models.some((model) => metaVal.includes(model))) return true;
    if (hints.tokens.some((token) => token.length >= 3 && metaVal.includes(token))) return true;
  }

  const title = normalizeSearchExpansionText(listing.title ?? "");
  for (const token of hints.tokens) {
    if (token.length < 3) continue;
    if (title.includes(token)) return true;
  }

  return false;
}
