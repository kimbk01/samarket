/**
 * Server-side national LGU search (picker/API). Does not ship full dataset to clients.
 */

import { normalizeTradeNationalLguName } from "@/lib/trade/location/national/normalize-lgu-name";
import { loadTradeNationalLguDataset } from "@/lib/trade/location/national/load-national-lgu-dataset";
import type { TradeNationalLgu } from "@/lib/trade/location/national/types";

export type TradeNationalLguSearchHit = {
  canonicalId: string;
  displayName: string;
  lguType: TradeNationalLgu["lguType"];
  regionCode: string;
  regionName: string;
  provinceCode: string | null;
  provinceName: string | null;
};

export function searchTradeNationalLgu(
  query: string,
  opts?: { limit?: number }
): TradeNationalLguSearchHit[] {
  const q = normalizeTradeNationalLguName(query);
  if (!q || q.length < 2) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const { lgus, aliasIndex } = loadTradeNationalLguDataset();

  const matchedIds = new Set<string>();
  for (const [alias, rows] of aliasIndex) {
    if (alias.includes(q) || q.includes(alias)) {
      for (const r of rows) matchedIds.add(r.canonicalId);
    }
  }
  for (const lgu of lgus) {
    const n = normalizeTradeNationalLguName(lgu.displayName);
    if (n.includes(q) || q.includes(n)) matchedIds.add(lgu.canonicalId);
  }

  const hits: TradeNationalLguSearchHit[] = [];
  for (const id of matchedIds) {
    const lgu = lgus.find((l) => l.canonicalId === id);
    if (!lgu?.isActive) continue;
    hits.push({
      canonicalId: lgu.canonicalId,
      displayName: lgu.displayName,
      lguType: lgu.lguType,
      regionCode: lgu.regionCode,
      regionName: lgu.regionName,
      provinceCode: lgu.provinceCode,
      provinceName: lgu.provinceName,
    });
  }

  hits.sort((a, b) => {
    const qn = q;
    const rank = (name: string) => {
      const n = normalizeTradeNationalLguName(name);
      if (n === qn) return 0;
      if (n.startsWith(qn)) return 1;
      if (n.startsWith(`city of ${qn}`) || n.startsWith(`${qn} city`)) return 1;
      // Prefer query as a whole token (avoids Ambaguio beating Baguio for "baguio")
      if (new RegExp(`(?:^|\\s)${qn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(n)) {
        return 2;
      }
      return 3;
    };
    const ar = rank(a.displayName);
    const br = rank(b.displayName);
    if (ar !== br) return ar - br;
    return a.displayName.localeCompare(b.displayName, "en");
  });

  // One row per canonical
  const out: TradeNationalLguSearchHit[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (seen.has(h.canonicalId)) continue;
    seen.add(h.canonicalId);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
