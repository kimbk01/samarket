/**
 * Product URL / cache token → PSGC canonical (browser-safe, no fs).
 * Must stay 29/29 in sync with data/trade-national-lgu legacy_product aliases
 * (asserted by unit test vs loadTradeNationalLguDataset).
 */

export const TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL = Object.freeze({
  "manila-city": "1380600000",
  makati: "1380300000",
  taguig: "1381500000",
  pasig: "1381200000",
  mandaluyong: "1380500000",
  paranaque: "1381000000",
  "las-pinas": "1380200000",
  muntinlupa: "1380800000",
  marikina: "1380700000",
  caloocan: "1380100000",
  valenzuela: "1381600000",
  malabon: "1380400000",
  navotas: "1380900000",
  "san-juan": "1381400000",
  pasay: "1381100000",
  pateros: "1381701000",
  "quezon-city": "1381300000",
  "cebu-city": "0730600000",
  mandaue: "0731300000",
  "lapu-lapu": "0731100000",
  consolacion: "0702219000",
  liloan: "0702227000",
  talisay: "0702250000",
  minglanilla: "0702232000",
  "naga-cebu": "0702234000",
  toledo: "0702251000",
  carcar: "0702214000",
  cordova: "0702220000",
  angeles: "0330100000",
} as const);

export type TradeLegacyProductAlias = keyof typeof TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL;

const CANONICAL_TO_LEGACY = new Map<string, TradeLegacyProductAlias>(
  (Object.entries(TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL) as [TradeLegacyProductAlias, string][]).map(
    ([alias, cid]) => [cid, alias]
  )
);

/** PSGC City/Municipality codes are 10 digits. */
export function isTradeNationalPsgcCanonicalId(raw: string | null | undefined): boolean {
  return /^\d{10}$/.test((raw ?? "").trim());
}

/**
 * URL/query token → canonical PSGC.
 * Accepts legacy product alias (`pasig`) or 10-digit PSGC.
 */
export function resolveTradeLguUrlTokenToCanonical(
  raw: string | null | undefined
): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  if (isTradeNationalPsgcCanonicalId(t)) return t;
  const fromAlias =
    TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL[t as TradeLegacyProductAlias] ?? null;
  return fromAlias;
}

export function resolveCanonicalToLegacyProductAlias(
  canonicalId: string | null | undefined
): TradeLegacyProductAlias | null {
  const id = (canonicalId ?? "").trim();
  if (!id) return null;
  return CANONICAL_TO_LEGACY.get(id) ?? null;
}
