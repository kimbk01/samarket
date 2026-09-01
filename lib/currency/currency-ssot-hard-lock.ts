/**
 * DIBAY Currency SSOT HARD LOCK — product + visual contract anchors.
 * Gate: `npm run verify:currency-ssot-hard-lock`
 * Doc: `docs/dibay-currency-ssot-hard-lock.md`
 */

export const CURRENCY_CANONICAL_IDS = ["POINT", "COIN", "CASH"] as const;
export type CurrencyCanonicalId = (typeof CURRENCY_CANONICAL_IDS)[number];

/** Internal authority IDs (financial). User-facing names differ — see display contract. */
export const CURRENCY_AUTHORITY = {
  POINT: {
    id: "POINT" as const,
    owner: "GENERAL_MEMBER" as const,
    balanceTable: "profiles.points",
    ledgerTable: "point_ledger",
    ledgerSsot: "sum_user_point_ledger",
    recharge: true,
    withdraw: false,
  },
  COIN: {
    id: "COIN" as const,
    owner: "STORE" as const,
    balanceTable: "store_economic_point_accounts",
    ledgerTable: "store_economic_point_ledger",
    recharge: false,
    withdraw: true,
    cashConversion: true,
  },
  CASH: {
    id: "CASH" as const,
    owner: "STORE" as const,
    balanceTable: "business_cash_accounts",
    ledgerTable: "business_cash_ledger",
    recharge: true,
    withdraw: false,
  },
} as const;

/** Legacy authorities — preserve history; no new product writers. */
export const CURRENCY_LEGACY_AUTHORITIES = [
  "stores.point_balance",
  "store_point_ledger",
  "store_cash_accounts",
  "store_cash_ledger",
  "delivery_ad_accounts",
  "delivery_ad_business_cash_ledger",
] as const;

/**
 * TS files allowed to reference legacy write surfaces (frozen list).
 * New writers must not be added outside this allowlist.
 */
export const CURRENCY_LEGACY_WRITER_ALLOWLIST = [
  "lib/stores/advertising/delivery-ad-store-cash-writer.ts",
  "lib/gift-certificate/gift-certificate-rpc.ts",
  "supabase/migrations/",
] as const;

/** Patterns that indicate a forbidden legacy balance write in TS (not in allowlisted paths). */
export const CURRENCY_FORBIDDEN_WRITER_PATTERNS = [
  /\.from\(["']delivery_ad_accounts["']\)[\s\S]{0,200}\.(insert|update|upsert)\(/,
  /\.from\(["']store_cash_accounts["']\)[\s\S]{0,200}\.(insert|update|upsert)\(/,
] as const;

/** Gift cash-out merges into canonical Coin withdrawal rail (owner decision). */
export const GIFT_CASH_OUT_MERGED_INTO_COIN_WITHDRAWAL = true as const;

export const CURRENCY_VISUAL_VARIANTS = ["point", "coin", "cash"] as const;
export type CurrencyVisualVariant = (typeof CURRENCY_VISUAL_VARIANTS)[number];

export function assertCurrencySsotHardLockAnchors(): boolean {
  return (
    CURRENCY_CANONICAL_IDS.length === 3 &&
    CURRENCY_AUTHORITY.POINT.owner === "GENERAL_MEMBER" &&
    CURRENCY_AUTHORITY.COIN.owner === "STORE" &&
    CURRENCY_AUTHORITY.CASH.owner === "STORE" &&
    CURRENCY_AUTHORITY.COIN.recharge === false &&
    CURRENCY_AUTHORITY.CASH.withdraw === false &&
    GIFT_CASH_OUT_MERGED_INTO_COIN_WITHDRAWAL === true
  );
}
