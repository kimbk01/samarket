/**
 * Browser-safe trade_lgu_id → PSGC displayName lookup.
 * Slim JSON derived from lgu-projection.json (no fs). Prefer product rollup
 * labels via resolveTradeListingPublicCityLabel when a legacy alias exists.
 */

import displayFile from "@/data/trade-national-lgu/lgu-display-by-id.json";

type DisplayFile = {
  dataset_version: string;
  by_id: Record<string, string>;
};

const byId = (displayFile as DisplayFile).by_id;

export function getTradeNationalLguDisplayNameById(
  canonicalId: string | null | undefined
): string | null {
  const id = (canonicalId ?? "").trim();
  if (!id) return null;
  const name = byId[id];
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
