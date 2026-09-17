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

/**
 * Historical authorities only. They may remain as accounting evidence but must
 * not be reachable as product balances, writers, mutations, navigation, or UI.
 */
export const CURRENCY_LEGACY_AUTHORITIES = [
  "stores.point_balance",
  "store_point_ledger",
  "store_cash_accounts",
  "store_cash_ledger",
  "delivery_ad_accounts",
  "delivery_ad_business_cash_ledger",
] as const;

/** Patterns that indicate a forbidden legacy balance write in TS (not in allowlisted paths). */
export const CURRENCY_FORBIDDEN_WRITER_PATTERNS = [
  /\.from\(["']delivery_ad_accounts["']\)[\s\S]{0,200}\.(insert|update|upsert)\(/,
  /\.from\(["']store_cash_accounts["']\)[\s\S]{0,200}\.(insert|update|upsert)\(/,
] as const;

export const LEGACY_HISTORICAL_DATA_IS_NOT_PRODUCT = true as const;

/** Gift cash-out merges into canonical Coin withdrawal rail (owner decision). */
export const GIFT_CASH_OUT_MERGED_INTO_COIN_WITHDRAWAL = true as const;

/**
 * Owner-locked Point fungibility (Finance CLOSE).
 * One wallet; source/destination must remain ledger-traceable.
 * Gift purchase may spend any Point — no purchased/reward wallet split.
 */
export const POINT_FUNGIBILITY_CONTRACT = {
  singleWallet: true as const,
  separatePurchasedRewardWallets: false as const,
  giftSpendSourceGate: "NONE" as const,
  rewardToGiftToMerchantCoinToPayout: "ALLOWED_FUNGIBLE" as const,
  sourceTraceRequired: true as const,
  sourceFields: ["entry_type", "related_type", "related_id"] as const,
} as const;

/** Cash ledger amount_minor = cash moved; fee due is obligations-only. */
export const CASH_LEDGER_AMOUNT_IS_CASH_MOVED = true as const;

/** Direct account balance writes without ledgered RPC are forbidden. */
export const CASH_DIRECT_BALANCE_MUTATION_FORBIDDEN = true as const;

/**
 * F-05 — Coin refund economic unwind (existing CUT B implementation).
 * Refund always reverses order SALE_EARN on Coin; never claws Cash by location.
 * Negative Coin after convert/withdraw = merchant debt.
 */
export const COIN_REFUND_ECONOMIC_UNWIND_CONTRACT = {
  postConversionRefund: "COIN_REVERSAL" as const,
  postWithdrawalRefund: "COIN_REVERSAL" as const,
  insufficientCoinOnRefund: "NEGATIVE_COIN_DEBT_ALLOWED" as const,
  cashClawback: false as const,
  orderToConversionProvenance: "NOT_REQUIRED_FUNGIBLE_COIN_POOL" as const,
  refundIdempotencyKeyPrefix: "coin_reversal:order:" as const,
  /** Balance need not return to zero; negative = liability. */
  coinBalanceMustReturnToZero: false as const,
} as const;

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
    LEGACY_HISTORICAL_DATA_IS_NOT_PRODUCT === true &&
    GIFT_CASH_OUT_MERGED_INTO_COIN_WITHDRAWAL === true &&
    POINT_FUNGIBILITY_CONTRACT.singleWallet === true &&
    POINT_FUNGIBILITY_CONTRACT.separatePurchasedRewardWallets === false &&
    POINT_FUNGIBILITY_CONTRACT.giftSpendSourceGate === "NONE" &&
    CASH_LEDGER_AMOUNT_IS_CASH_MOVED === true &&
    CASH_DIRECT_BALANCE_MUTATION_FORBIDDEN === true &&
    COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.postConversionRefund === "COIN_REVERSAL" &&
    COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.postWithdrawalRefund === "COIN_REVERSAL" &&
    COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.insufficientCoinOnRefund ===
      "NEGATIVE_COIN_DEBT_ALLOWED" &&
    COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.cashClawback === false &&
    COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.orderToConversionProvenance ===
      "NOT_REQUIRED_FUNGIBLE_COIN_POOL" &&
    COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.coinBalanceMustReturnToZero === false
  );
}
