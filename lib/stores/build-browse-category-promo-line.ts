/**
 * CUT 7 — BROWSE delivery-fee benefit decoration line (NOT editorial promotion).
 * Authority: commerce fee extras / deliveryFeeStrikePhp evidence only.
 * Does not read store_discovery_campaigns / paid / coupon / banner.
 */

import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  commerceExtrasFromBrowseSnapshot,
  type BrowseStoreCommerceSnapshot,
} from "@/lib/stores/browse-store-commerce-snapshot";
import type { BrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";
import {
  formatStoreBrowseDeliveryFeeLine,
  formatStoreBrowseDeliveryFeeStrikePhp,
  storeBrowseDeliveryFeeShowsFreeBadge,
} from "@/lib/stores/store-commerce-extras";

/**
 * CATEGORY fee-benefit bar copy — only when DIBAY fee authority proves a benefit.
 * Never synthesize discount without real fee evidence.
 * Never sourced from EDITORIAL_PROMOTION / COUPON / PAID / BANNER.
 */
export function buildBrowseDeliveryFeeBenefitLine(
  lang: AppLanguageCode,
  commerce: BrowseStoreCommerceSnapshot | null,
  rowLabels: BrowseStoreRowLabels | null,
  opts: { deliveryAvailable: boolean }
): string | null {
  if (!opts.deliveryAvailable || !commerce || !rowLabels) return null;

  const extras = commerceExtrasFromBrowseSnapshot(commerce);
  const feeLine = formatStoreBrowseDeliveryFeeLine(extras, opts, lang);
  const strikePhp = formatStoreBrowseDeliveryFeeStrikePhp(extras, opts);

  if (extras.deliveryFeeMode === "self_free_promo" && feeLine) {
    if (strikePhp != null && strikePhp > 0) {
      return `${feeLine} · ${formatMoneyPhp(strikePhp)}`;
    }
    return feeLine;
  }

  if (
    storeBrowseDeliveryFeeShowsFreeBadge(extras) &&
    feeLine &&
    extras.deliveryFeeMode === "self"
  ) {
    return feeLine;
  }

  return null;
}

/**
 * @deprecated CUT 7 — name implied editorial "promo"; use buildBrowseDeliveryFeeBenefitLine.
 */
export const buildBrowseCategoryPromoLine = buildBrowseDeliveryFeeBenefitLine;
