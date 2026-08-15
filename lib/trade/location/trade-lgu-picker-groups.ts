/**
 * Full Philippines LGU picker grouping — derived from REGIONS catalog + LGU rollup.
 * Does not invent provinces outside the trade taxonomy.
 */

import { REGIONS } from "@/lib/products/regions-data";
import {
  listTradeLguCities,
  resolveTradeLguCityFromInternal,
  type TradeLguCityDef,
} from "@/lib/trade/location/trade-lgu-city-rollup";

export type TradeLguPickerGroup = {
  id: string;
  label: string;
  cities: TradeLguCityDef[];
};

const REGION_GROUP_LABEL: Record<string, string> = {
  manila: "Metro Manila",
  quezon: "Quezon City",
  cebu: "Cebu",
  angeles: "Central Luzon",
};

function uniqueLgusForRegion(regionId: string): TradeLguCityDef[] {
  const region = REGIONS.find((r) => r.id === regionId);
  if (!region) return [];
  const seen = new Set<string>();
  const out: TradeLguCityDef[] = [];
  for (const city of region.cities) {
    const lgu = resolveTradeLguCityFromInternal(region.id, city.id);
    if (!lgu || seen.has(lgu.id)) continue;
    seen.add(lgu.id);
    out.push(lgu);
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName, "en"));
}

/** Grouped unique LGUs for full selector (29 catalog LGUs today). */
export function listTradeLguPickerGroups(): TradeLguPickerGroup[] {
  return REGIONS.map((r) => ({
    id: r.id,
    label: REGION_GROUP_LABEL[r.id] ?? r.name,
    cities: uniqueLgusForRegion(r.id),
  })).filter((g) => g.cities.length > 0);
}

export function countUniqueTradeLguCities(): number {
  return listTradeLguCities().length;
}

export function filterTradeLguCitiesByQuery(query: string): TradeLguCityDef[] {
  const q = query.trim().toLowerCase();
  const all = listTradeLguCities();
  if (!q) return all;
  return all.filter((c) => c.displayName.toLowerCase().includes(q) || c.id.includes(q));
}
