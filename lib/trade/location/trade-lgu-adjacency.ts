/**
 * Trade LGU adjacency — explicit curated neighbors for “주변 주요 지역”.
 *
 * NOT derived from string parsing, array index, or alphabetical order.
 * Only LGUs present in `trade-lgu-city-rollup` may appear.
 * Source: deterministic product adjacency among catalog LGUs (NCR / Cebu / Angeles hubs).
 */

import { getTradeLguCityDef, isTradeLguCityId, type TradeLguCityId } from "@/lib/trade/location/trade-lgu-city-rollup";

/** Up to 4 neighbors per anchor — order = display priority */
const TRADE_LGU_ADJACENCY: Record<string, readonly TradeLguCityId[]> = {
  pasig: ["makati", "mandaluyong", "quezon-city", "taguig"],
  makati: ["pasig", "mandaluyong", "pasay", "taguig"],
  mandaluyong: ["pasig", "makati", "san-juan", "quezon-city"],
  taguig: ["makati", "pasig", "paranaque", "pateros"],
  "quezon-city": ["pasig", "marikina", "san-juan", "caloocan"],
  "manila-city": ["makati", "pasay", "san-juan", "quezon-city"],
  pasay: ["makati", "paranaque", "manila-city", "taguig"],
  paranaque: ["pasay", "taguig", "las-pinas", "muntinlupa"],
  "las-pinas": ["paranaque", "muntinlupa", "pasay"],
  muntinlupa: ["paranaque", "las-pinas", "taguig"],
  marikina: ["quezon-city", "pasig", "san-juan"],
  caloocan: ["quezon-city", "malabon", "valenzuela", "navotas"],
  valenzuela: ["caloocan", "malabon", "quezon-city"],
  malabon: ["navotas", "caloocan", "valenzuela"],
  navotas: ["malabon", "caloocan", "manila-city"],
  "san-juan": ["mandaluyong", "quezon-city", "manila-city", "pasig"],
  pateros: ["taguig", "pasig", "makati"],
  "cebu-city": ["mandaue", "lapu-lapu", "talisay", "cordova"],
  mandaue: ["cebu-city", "consolacion", "liloan", "lapu-lapu"],
  "lapu-lapu": ["cebu-city", "mandaue", "cordova"],
  consolacion: ["mandaue", "liloan", "cebu-city"],
  liloan: ["consolacion", "mandaue", "cebu-city"],
  talisay: ["cebu-city", "minglanilla", "naga-cebu"],
  minglanilla: ["talisay", "naga-cebu", "cebu-city"],
  "naga-cebu": ["minglanilla", "talisay", "carcar"],
  toledo: ["cebu-city", "naga-cebu"],
  carcar: ["naga-cebu", "talisay"],
  cordova: ["lapu-lapu", "cebu-city"],
  angeles: [],
};

export const TRADE_LGU_NEARBY_LIMIT = 4 as const;

export type TradeLguNearbySource = "explicit_adjacency_table";

export function getTradeLguNearbySource(): TradeLguNearbySource {
  return "explicit_adjacency_table";
}

/**
 * Nearby LGUs for panel — excludes anchor, invalid ids, and duplicates.
 * If `excludeLguId` is set (e.g. already shown as 나의 주소), omit it.
 */
export function resolveTradeLguNearbyCities(
  anchorLguId: string | null | undefined,
  options?: { limit?: number; excludeLguId?: string | null }
): Array<{ id: TradeLguCityId; displayName: string }> {
  const anchor = (anchorLguId ?? "").trim();
  if (!anchor || !isTradeLguCityId(anchor)) return [];
  const limit = Math.max(1, Math.min(options?.limit ?? TRADE_LGU_NEARBY_LIMIT, TRADE_LGU_NEARBY_LIMIT));
  const exclude = (options?.excludeLguId ?? "").trim();
  const raw = TRADE_LGU_ADJACENCY[anchor] ?? [];
  const out: Array<{ id: TradeLguCityId; displayName: string }> = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (!isTradeLguCityId(id)) continue;
    if (id === anchor) continue;
    if (exclude && id === exclude) continue;
    if (seen.has(id)) continue;
    const def = getTradeLguCityDef(id);
    if (!def) continue;
    seen.add(id);
    out.push({ id: def.id, displayName: def.displayName });
    if (out.length >= limit) break;
  }
  return out;
}
