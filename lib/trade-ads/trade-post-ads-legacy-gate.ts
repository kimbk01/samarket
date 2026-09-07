/**
 * AD-P0-3 — trade_post_ads LEGACY gate.
 * New member apply writes blocked. History read-only. Canonical rail = trade_boost / feed banner.
 */
import {
  TRADE_POST_ADS_LEGACY_LABEL,
  TRADE_POST_ADS_NEW_WRITES_ENABLED,
} from "@/lib/finance/product-decision-lock";

export const TRADE_POST_ADS_NEW_WRITES_DISABLED_ERROR =
  "trade_post_ads_new_writes_disabled" as const;

export function assertTradePostAdsNewWriteAllowed():
  | { ok: true }
  | { ok: false; error: typeof TRADE_POST_ADS_NEW_WRITES_DISABLED_ERROR } {
  if (TRADE_POST_ADS_NEW_WRITES_ENABLED) return { ok: true };
  return { ok: false, error: TRADE_POST_ADS_NEW_WRITES_DISABLED_ERROR };
}

export function tradePostAdsLegacyLabel(): typeof TRADE_POST_ADS_LEGACY_LABEL {
  return TRADE_POST_ADS_LEGACY_LABEL;
}
