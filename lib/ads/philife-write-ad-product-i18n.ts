import type { AdProduct, AdType } from "@/lib/ads/types";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PostAdTranslate } from "@/lib/ads/post-ad-label-keys";

const AD_PRODUCT_TITLE_KEY: Partial<Record<AdType, MessageKey>> = {
  top_fixed: "philife_write_ad_product_top_fixed_title",
  mid_insert: "philife_write_ad_product_mid_insert_title",
  highlight: "philife_write_ad_product_highlight_title",
};

const AD_PRODUCT_DESC_KEY: Partial<Record<AdType, MessageKey>> = {
  top_fixed: "philife_write_ad_product_top_fixed_desc",
  mid_insert: "philife_write_ad_product_mid_insert_desc",
  highlight: "philife_write_ad_product_highlight_desc",
};

/** API `name` 대신 UI 언어 카탈로그 라벨 (adType + 기간) */
export function philifeWriteAdProductTitle(
  t: PostAdTranslate,
  product: Pick<AdProduct, "adType" | "durationDays" | "name">
): string {
  const key = AD_PRODUCT_TITLE_KEY[product.adType];
  if (key) return t(key, { days: product.durationDays });
  return product.name?.trim() || "";
}

export function philifeWriteAdProductDescription(
  t: PostAdTranslate,
  product: Pick<AdProduct, "adType" | "durationDays" | "description">
): string {
  const key = AD_PRODUCT_DESC_KEY[product.adType];
  if (key) return t(key, { days: product.durationDays });
  return product.description?.trim() || "";
}

export function philifeWriteAdProductPointCost(
  t: PostAdTranslate,
  pointCost: number,
  locale?: string
): string {
  const amount = pointCost.toLocaleString(locale);
  return t("philife_write_ad_point_cost", { amount });
}
