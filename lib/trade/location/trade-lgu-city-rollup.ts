/**
 * TRADE LGU CITY ROLLUP — ONE authority for Address + Listing discovery.
 *
 * `posts.city` / `app_city_id` are neighborhood taxonomy IDs (regions-data).
 * Product City is Philippine LGU (e.g. Pasig City).
 *
 * Mapping is an explicit curated table — NOT runtime string parsing.
 * Coverage: every REGIONS city id must appear exactly once (see unit test).
 */

import { REGIONS } from "@/lib/products/regions-data";

export type TradeLguCityId = string;

export type TradeLguCityMember = {
  regionId: string;
  cityId: string;
};

export type TradeLguCityDef = {
  id: TradeLguCityId;
  /** User-facing LGU label only — never barangay/street */
  displayName: string;
  members: readonly TradeLguCityMember[];
};

/** Explicit neighborhood → LGU. Keys are `${regionId}|${cityId}`. */
const INTERNAL_TO_LGU: Record<string, TradeLguCityId> = {
  // City of Manila
  "manila|m1": "manila-city",
  "manila|m3": "manila-city",
  "manila|m4": "manila-city",
  "manila|m5": "manila-city",
  "manila|m6": "manila-city",
  "manila|m7": "manila-city",
  "manila|m8": "manila-city",
  "manila|m9": "manila-city",
  "manila|m10": "manila-city",
  "manila|m11": "manila-city",
  "manila|m12": "manila-city",
  "manila|m13": "manila-city",
  "manila|m14": "manila-city",
  "manila|m15": "manila-city",
  "manila|m16": "manila-city",
  "manila|m17": "manila-city",
  // Makati
  "manila|m2": "makati",
  "manila|m39": "makati",
  "manila|m40": "makati",
  // Taguig
  "manila|m18": "taguig",
  "manila|m19": "taguig",
  // Pasig
  "manila|m20": "pasig",
  "manila|m21": "pasig",
  "manila|m22": "pasig",
  // Mandaluyong
  "manila|m23": "mandaluyong",
  "manila|m24": "mandaluyong",
  // Parañaque
  "manila|m25": "paranaque",
  "manila|m26": "paranaque",
  // Other NCR LGUs (single or paired taxonomy slots)
  "manila|m27": "las-pinas",
  "manila|m28": "muntinlupa",
  "manila|m29": "marikina",
  "manila|m30": "caloocan",
  "manila|m31": "caloocan",
  "manila|m32": "valenzuela",
  "manila|m33": "malabon",
  "manila|m34": "navotas",
  "manila|m35": "san-juan",
  "manila|m36": "pasay",
  "manila|m37": "pasay",
  "manila|m38": "pateros",
};

/** Quezon City region = one LGU; all q* map to quezon-city */
for (const c of REGIONS.find((r) => r.id === "quezon")?.cities ?? []) {
  INTERNAL_TO_LGU[`quezon|${c.id}`] = "quezon-city";
}

/** Angeles region = Angeles City */
for (const c of REGIONS.find((r) => r.id === "angeles")?.cities ?? []) {
  INTERNAL_TO_LGU[`angeles|${c.id}`] = "angeles";
}

/** Cebu region — mixed LGUs; remaining slots are Cebu City */
const CEBU_NON_CITY: Record<string, TradeLguCityId> = {
  c2: "mandaue",
  c26: "consolacion",
  c27: "liloan",
  c28: "lapu-lapu",
  c29: "lapu-lapu",
  c30: "talisay",
  c31: "minglanilla",
  c32: "naga-cebu",
  c33: "toledo",
  c34: "carcar",
  c35: "cordova",
};
for (const c of REGIONS.find((r) => r.id === "cebu")?.cities ?? []) {
  INTERNAL_TO_LGU[`cebu|${c.id}`] = CEBU_NON_CITY[c.id] ?? "cebu-city";
}

const LGU_DISPLAY: Record<TradeLguCityId, string> = {
  "manila-city": "Manila City",
  makati: "Makati City",
  taguig: "Taguig City",
  pasig: "Pasig City",
  mandaluyong: "Mandaluyong City",
  paranaque: "Parañaque City",
  "las-pinas": "Las Piñas City",
  muntinlupa: "Muntinlupa City",
  marikina: "Marikina City",
  caloocan: "Caloocan City",
  valenzuela: "Valenzuela City",
  malabon: "Malabon City",
  navotas: "Navotas City",
  "san-juan": "San Juan City",
  pasay: "Pasay City",
  pateros: "Pateros",
  "quezon-city": "Quezon City",
  "cebu-city": "Cebu City",
  mandaue: "Mandaue City",
  "lapu-lapu": "Lapu-Lapu City",
  consolacion: "Consolacion",
  liloan: "Liloan",
  talisay: "Talisay City",
  minglanilla: "Minglanilla",
  "naga-cebu": "Naga City",
  toledo: "Toledo City",
  carcar: "Carcar City",
  cordova: "Cordova",
  angeles: "Angeles City",
};

function memberKey(regionId: string, cityId: string): string {
  return `${regionId.trim()}|${cityId.trim()}`;
}

function buildLguIndex(): Map<TradeLguCityId, TradeLguCityMember[]> {
  const map = new Map<TradeLguCityId, TradeLguCityMember[]>();
  for (const [key, lguId] of Object.entries(INTERNAL_TO_LGU)) {
    const [regionId, cityId] = key.split("|");
    if (!regionId || !cityId) continue;
    const list = map.get(lguId) ?? [];
    list.push({ regionId, cityId });
    map.set(lguId, list);
  }
  return map;
}

const LGU_MEMBERS = buildLguIndex();

export function listTradeLguCities(): TradeLguCityDef[] {
  return [...LGU_MEMBERS.entries()]
    .map(([id, members]) => ({
      id,
      displayName: LGU_DISPLAY[id] ?? id,
      members,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "en"));
}

export function isTradeLguCityId(raw: string | null | undefined): raw is TradeLguCityId {
  const id = (raw ?? "").trim();
  return id.length > 0 && LGU_MEMBERS.has(id);
}

export function getTradeLguCityDef(lguId: string | null | undefined): TradeLguCityDef | null {
  const id = (lguId ?? "").trim();
  if (!id || !LGU_MEMBERS.has(id)) return null;
  return {
    id,
    displayName: LGU_DISPLAY[id] ?? id,
    members: LGU_MEMBERS.get(id)!,
  };
}

export function resolveTradeLguCityFromInternal(
  regionId: string | null | undefined,
  cityId: string | null | undefined
): TradeLguCityDef | null {
  const rid = (regionId ?? "").trim();
  const cid = (cityId ?? "").trim();
  if (!rid || !cid) return null;
  const lguId = INTERNAL_TO_LGU[memberKey(rid, cid)];
  if (!lguId) return null;
  return getTradeLguCityDef(lguId);
}

export function resolveTradeInternalCityIdsForLgu(
  lguId: string | null | undefined
): TradeLguCityMember[] {
  return getTradeLguCityDef(lguId)?.members.slice() ?? [];
}

/** Query shape: one region + city IN (…) — all current LGUs are single-region. */
export type TradeLguCityQueryConstraint = {
  regionId: string;
  cityIds: string[];
};

export function resolveTradeLguCityQueryConstraint(
  lguId: string | null | undefined
): TradeLguCityQueryConstraint | null {
  const members = resolveTradeInternalCityIdsForLgu(lguId);
  if (members.length === 0) return null;
  const regionId = members[0]!.regionId;
  if (members.some((m) => m.regionId !== regionId)) {
    /** Multi-region LGU not supported in P0 — treat as gap */
    return null;
  }
  return {
    regionId,
    cityIds: [...new Set(members.map((m) => m.cityId))],
  };
}

export type TradeLguRollupCoverage = {
  totalInternalIds: number;
  mapped: number;
  unmapped: Array<{ regionId: string; cityId: string; name: string }>;
  ambiguous: never[];
};

/** Proof helper — unit tests assert unmapped.length === 0 */
export function auditTradeLguRollupCoverage(): TradeLguRollupCoverage {
  const unmapped: TradeLguRollupCoverage["unmapped"] = [];
  let total = 0;
  for (const region of REGIONS) {
    for (const city of region.cities) {
      total += 1;
      if (!INTERNAL_TO_LGU[memberKey(region.id, city.id)]) {
        unmapped.push({ regionId: region.id, cityId: city.id, name: city.name });
      }
    }
  }
  return {
    totalInternalIds: total,
    mapped: total - unmapped.length,
    unmapped,
    ambiguous: [],
  };
}
