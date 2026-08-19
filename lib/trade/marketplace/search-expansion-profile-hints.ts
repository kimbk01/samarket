/**
 * CUT-SSOT-2 — profile-aware catalog hints for search expansion (beyond used-car).
 */
import {
  normalizeSearchExpansionText,
  type SearchExpansionHints,
} from "@/lib/trade/marketplace/search-candidate-expansion";
import { getTradeOptionCatalog } from "@/lib/trade/category-form/option-catalogs";

export type SearchMetaCatalogMatch = {
  metaKey: string;
  value: string;
};

/** Catalog-backed meta fields searched across Marketplace ROOT profiles. */
const PROFILE_SEARCH_CATALOG_BINDINGS: { catalogId: string; metaKey: string }[] = [
  { catalogId: "exchange_direction", metaKey: "exchange_direction" },
  { catalogId: "jobs_listing_kind", metaKey: "listing_kind" },
  { catalogId: "jobs_work_category", metaKey: "work_category" },
  { catalogId: "real_estate_deal_type", metaKey: "deal_type" },
  { catalogId: "real_estate_estate_type", metaKey: "estate_type" },
  { catalogId: "used_car_trade", metaKey: "car_trade" },
];

function catalogNeedles(catalogId: string): { value: string; labels: string[] }[] {
  return getTradeOptionCatalog(catalogId).map((entry) => ({
    value: normalizeSearchExpansionText(entry.value),
    labels: [
      normalizeSearchExpansionText(entry.value),
      normalizeSearchExpansionText(entry.labelEn),
      normalizeSearchExpansionText(entry.labelKo),
    ].filter((s) => s.length > 0),
  }));
}

function tokenHitsCatalog(
  token: string,
  rows: { value: string; labels: string[] }[]
): string | null {
  if (token.length < 2) return null;
  for (const row of rows) {
    if (row.labels.some((label) => label === token || (token.length >= 3 && label.includes(token)))) {
      return row.value;
    }
  }
  return null;
}

function phraseHitsCatalog(
  phrase: string,
  rows: { value: string; labels: string[] }[]
): string | null {
  for (const row of rows) {
    if (row.labels.some((label) => label.length >= 2 && phrase.includes(label))) {
      return row.value;
    }
  }
  return null;
}

export function resolveProfileMetaCatalogMatches(
  phrase: string,
  tokens: string[]
): SearchMetaCatalogMatch[] {
  const out: SearchMetaCatalogMatch[] = [];
  const seen = new Set<string>();
  for (const { catalogId, metaKey } of PROFILE_SEARCH_CATALOG_BINDINGS) {
    const rows = catalogNeedles(catalogId);
    let value = phraseHitsCatalog(phrase, rows);
    if (!value) {
      for (const token of tokens) {
        value = tokenHitsCatalog(token, rows);
        if (value) break;
      }
    }
    if (!value) continue;
    const key = `${metaKey}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ metaKey, value });
  }
  return out;
}

export function mergeProfileHintsIntoSearchExpansion(
  base: SearchExpansionHints
): SearchExpansionHints {
  const metaCatalogMatches = resolveProfileMetaCatalogMatches(base.phrase, base.tokens);
  if (metaCatalogMatches.length === 0) return base;
  return { ...base, metaCatalogMatches };
}

export function listingMatchesMetaCatalogHints(
  meta: Record<string, unknown> | null | undefined,
  matches: SearchMetaCatalogMatch[]
): boolean {
  if (!meta || matches.length === 0) return false;
  for (const { metaKey, value } of matches) {
    const raw = meta[metaKey];
    if (typeof raw === "string" && normalizeSearchExpansionText(raw) === normalizeSearchExpansionText(value)) {
      return true;
    }
  }
  return false;
}
