import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import type { TradeAdProductRow } from "@/lib/trade-ads/load-trade-ad-product";
import {
  tradeAdCheckDetail,
  tradeAdCheckLabel,
  tradePaidAdFormatGuide,
} from "@/lib/trade-ads/trade-post-ad-policy-i18n";

type TradeAdPostLike = {
  type?: string | null;
  status?: string | null;
  title?: string | null;
  content?: string | null;
  price?: number | null;
  is_free_share?: boolean | null;
  category_id?: string | null;
  trade_category_id?: string | null;
  region?: string | null;
  thumbnail_url?: string | null;
  images?: unknown;
};

export type TradeAdEligibilityCheck = {
  key: string;
  pass: boolean;
  label: string;
  detail: string;
  blocking: boolean;
};

export type TradeAdEligibilityResult = {
  eligible: boolean;
  checks: TradeAdEligibilityCheck[];
  blockingReason: string | null;
};

/** @deprecated `tradePaidAdFormatGuide(lang)` 사용 */
export const TRADE_PAID_AD_FORMAT_GUIDE = tradePaidAdFormatGuide(DEFAULT_APP_LANGUAGE);

function hasTradeImage(post: TradeAdPostLike): boolean {
  if (typeof post.thumbnail_url === "string" && post.thumbnail_url.trim().length > 0) return true;
  if (!Array.isArray(post.images)) return false;
  return post.images.some((u) => typeof u === "string" && u.trim().length > 0);
}

function normalizeRegion(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function postCategoryId(post: TradeAdPostLike): string {
  return String(post.category_id ?? post.trade_category_id ?? "").trim();
}

export function evaluateTradePostAdEligibility(input: {
  post: TradeAdPostLike;
  product: TradeAdProductRow;
  serviceSegment: string;
  lang?: AppLanguageCode;
}): TradeAdEligibilityResult {
  const lang = input.lang ?? DEFAULT_APP_LANGUAGE;
  const post = input.post;
  const product = input.product;
  const status = String(post.status ?? "").trim().toLowerCase();
  const title = String(post.title ?? "").trim();
  const content = String(post.content ?? "").trim();
  const checks: TradeAdEligibilityCheck[] = [];

  const push = (key: string, pass: boolean, blocking = true) =>
    checks.push({
      key,
      pass,
      label: tradeAdCheckLabel(lang, key),
      detail: tradeAdCheckDetail(lang, key, pass),
      blocking,
    });

  push("trade_post", post.type !== "community");
  push("status_active", status === "active");
  push("title_quality", title.length >= 6);
  push("image_exists", hasTradeImage(post));
  push("content_quality", content.length >= 10);
  const hasPrice = post.is_free_share === true || (typeof post.price === "number" && post.price > 0);
  push("price_or_share", hasPrice);

  const placement = (product.placement ?? "").trim();
  const tradePlacement =
    product.board_key === "trade" ||
    placement === "detail_bottom" ||
    placement === "list_top" ||
    placement === "home_featured" ||
    placement === "premium_all";
  push("product_trade_board", tradePlacement);

  const serviceMatched =
    !product.service_type || product.service_type.trim().length === 0 || product.service_type === input.serviceSegment;
  push("service_segment", serviceMatched);

  const categoryMatched = !product.category_id || product.category_id === postCategoryId(post);
  push("category_target", categoryMatched);

  const productRegion = normalizeRegion(product.region_target);
  const region = normalizeRegion(post.region);
  const regionMatched =
    !productRegion ||
    (region.length > 0 && (region === productRegion || region.includes(productRegion)));
  push("region_target", regionMatched);

  const failing = checks.find((check) => check.blocking && !check.pass) ?? null;
  return {
    eligible: failing == null,
    checks,
    blockingReason: failing?.detail ?? null,
  };
}

export { tradePaidAdFormatGuide } from "@/lib/trade-ads/trade-post-ad-policy-i18n";
