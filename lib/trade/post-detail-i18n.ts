/**
 * 거래 상품 상세(PostDetailView) — i18n 헬퍼·DB raw deal_type 상수.
 * meta.deal_type 은 DB에 ko literal("판매"|"임대")로 저장 — 비교는 raw, 표시는 t().
 */
import type { MessageKey } from "@/lib/i18n/messages";

export type PostDetailTranslate = (
  key: MessageKey,
  vars?: Record<string, string | number>
) => string;

/** @see posts.meta.deal_type (legacy ko storage) */
export const RE_DEAL_TYPE_SALE_RAW = "판매";
export const RE_DEAL_TYPE_RENT_RAW = "임대";

export function reDealTypeDisplayLabel(t: PostDetailTranslate, raw: string | undefined): string {
  const d = raw?.trim() ?? "";
  if (d === RE_DEAL_TYPE_SALE_RAW) return t("trade_detail_meta_deal_sale");
  if (d === RE_DEAL_TYPE_RENT_RAW) return t("trade_detail_meta_deal_rent");
  return d;
}

export function isReDealTypeSale(raw: string | undefined): boolean {
  return raw?.trim() === RE_DEAL_TYPE_SALE_RAW;
}

export function isReDealTypeRent(raw: string | undefined): boolean {
  return raw?.trim() === RE_DEAL_TYPE_RENT_RAW;
}

export function tradeDetailViewsLine(t: PostDetailTranslate, count: number): string {
  return t("trade_detail_views_count", { count });
}

export function tradeDetailFavoritesLine(t: PostDetailTranslate, count: number): string {
  return t("trade_detail_favorites_count", { count });
}

export function tradeDetailReSalePriceLine(t: PostDetailTranslate, priceLine: string): string {
  return t("trade_detail_re_footer_sale_price", { price: priceLine });
}

export function tradeDetailReSaleSummary(t: PostDetailTranslate, priceFormatted: string): string {
  return t("trade_detail_re_sale_summary", { price: priceFormatted });
}

export function tradeDetailReRentSummary(
  t: PostDetailTranslate,
  deposit: string,
  monthly: string
): string {
  return t("trade_detail_re_rent_summary", { deposit, monthly });
}

/** 채팅 CTA 비활성 사유 — 배너·toast 공용 */
export function tradeDetailChatBlockBanner(
  t: PostDetailTranslate,
  opts: {
    completed: boolean;
    reserved: boolean;
    otherReservation: boolean;
    chatDisabled?: boolean;
  }
): string {
  if (opts.completed) return t("trade_detail_chat_blocked_completed");
  if (opts.reserved) return t("trade_detail_chat_blocked_reserved");
  if (opts.otherReservation) return t("trade_detail_chat_blocked_other_reservation");
  if (opts.chatDisabled) return t("trade_detail_chat_blocked_disabled");
  return "";
}

export function tradeDetailChatBlockTitle(
  t: PostDetailTranslate,
  opts: Parameters<typeof tradeDetailChatBlockBanner>[1]
): string | undefined {
  const msg = tradeDetailChatBlockBanner(t, opts);
  return msg || undefined;
}
