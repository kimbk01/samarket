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
 * CATEGORY promo bar copy — only when DIBAY commerce/fee authority proves a promotion.
 * Never synthesize Baemin-style instant discount without real data.
 */
export function buildBrowseCategoryPromoLine(
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
