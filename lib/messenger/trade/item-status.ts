/**
 * Trade list item status badge — posts.seller_listing_state / status SSOT.
 * Never derive from last-message preview text.
 */
import {
  normalizeSellerListingState,
  publicListingBadgeKey,
  type SellerListingState,
} from "@/lib/products/seller-listing-state";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

export type TradeItemStatus = "available" | "reserved" | "sold" | "hidden" | "deleted";

export function resolveTradeItemStatus(
  input: {
    sellerListingStateRaw?: unknown;
    postStatus?: string | null;
  },
  /** 보는 사람 언어 — 서버 조립은 요청 언어를 넘긴다. 없으면 클라이언트 런타임 언어 */
  langInput?: AppLanguageCode | null
): { itemStatus: TradeItemStatus; statusBadgeLabel: string; listingState: SellerListingState } {
  const lang = langInput ?? getRuntimeAppLanguage();
  const postStatus = (input.postStatus ?? "").trim().toLowerCase();
  if (postStatus === "deleted") {
    return { itemStatus: "deleted", statusBadgeLabel: translate(lang, "mypage_r5_recent_deleted"), listingState: "completed" };
  }
  if (postStatus === "hidden" || postStatus === "blinded") {
    return { itemStatus: "hidden", statusBadgeLabel: translate(lang, "ui_product_status_hidden"), listingState: "inquiry" };
  }
  if (postStatus === "sold") {
    return { itemStatus: "sold", statusBadgeLabel: translate(lang, "ui_product_status_sold"), listingState: "completed" };
  }
  const listingState = normalizeSellerListingState(input.sellerListingStateRaw, postStatus);
  /** 언어 재감사 2026-11-27: 한국어 저장 토큰 라벨 대신 같은 규칙의 키 → 보는 사람 언어 */
  const badge = publicListingBadgeKey(listingState, postStatus || "active");
  let itemStatus: TradeItemStatus = "available";
  if (listingState === "reserved") itemStatus = "reserved";
  if (listingState === "completed") itemStatus = "sold";
  return {
    itemStatus,
    statusBadgeLabel: translate(lang, badge.key),
    listingState,
  };
}

/** Status-change system copy that must not duplicate the badge on line 3. */
export function looksLikeTradeStatusChangePreview(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /상태가\s*(판매중|예약중|거래완료|문의중)/.test(t) ||
    /제품의\s*상태가/.test(t) ||
    /listing\s*status/i.test(t) ||
    /changed.*(reserved|sold|available)/i.test(t)
  );
}

export function normalizeTradeListPreviewLine(input: {
  previewText: string;
  isSystem: boolean;
  statusBadgeLabel: string | null;
  /** 보는 사람 언어 — 서버 조립은 요청 언어를 넘긴다. 없으면 클라이언트 런타임 언어 */
  lang?: AppLanguageCode | null;
}): { text: string; isSystemEvent: boolean } {
  const lang = input.lang ?? getRuntimeAppLanguage();
  const text = input.previewText.trim();
  const isStatusCopy = looksLikeTradeStatusChangePreview(text);
  const isSystemEvent = input.isSystem || isStatusCopy;
  if (isStatusCopy && input.statusBadgeLabel) {
    return {
      text: translate(lang, "cm_ui_trade_status_changed_line", { state: input.statusBadgeLabel }),
      isSystemEvent: true,
    };
  }
  return { text: text || translate(lang, "community_messenger_no_messages"), isSystemEvent };
}
