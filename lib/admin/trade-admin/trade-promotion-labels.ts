/**
 * 거래 상위노출 — 글 상태 연동 이유 표시 (DB `paused_by`·`end_reason_code`, 트리거 `trade_promotion_sync_listing`).
 * 관리자 상위노출 목록·관리자 글 상세가 같은 표를 쓴다 (재감사 2026-11-04 B-5③).
 */
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 멈춘 이유 — 카탈로그 키 (화면에서 `t(key)`) */
export const LISTING_PAUSE_LABEL_KEYS: Record<string, MessageKey> = {
  listing_owner_hidden: "admin_trade_promotion_pause_owner_hidden",
  listing_admin_hidden: "admin_trade_promotion_pause_admin_hidden",
};

/** 끝난 이유 — 카탈로그 키 */
export const LISTING_END_LABEL_KEYS: Record<string, MessageKey> = {
  listing_sold: "admin_trade_promotion_end_sold",
  listing_owner_deleted: "admin_trade_promotion_end_owner_deleted",
  listing_admin_deleted: "admin_trade_promotion_end_admin_deleted",
};

function koLabels(keys: Record<string, MessageKey>): Record<string, string> {
  return Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, translate("ko", v)]));
}

/** 한국어 이름 표 — 기존 호출부 호환 */
export const LISTING_PAUSE_LABELS: Record<string, string> = koLabels(LISTING_PAUSE_LABEL_KEYS);

export const LISTING_END_LABELS: Record<string, string> = koLabels(LISTING_END_LABEL_KEYS);

/** 관리자 화면 한 줄 — 일시정지면 멈춘 이유, 종료면 끝난 이유, 없으면 null */
export function tradePromotionListingReasonLabel(
  row: {
    order_status?: string | null;
    paused_by?: string | null;
    end_reason_code?: string | null;
  },
  ko: boolean = true
): string | null {
  const lang = ko ? "ko" : "en";
  if (row.order_status === "paused" && row.paused_by) {
    const key = LISTING_PAUSE_LABEL_KEYS[row.paused_by];
    return key ? translate(lang, key) : null;
  }
  if (row.end_reason_code) {
    const key = LISTING_END_LABEL_KEYS[row.end_reason_code];
    return key ? translate(lang, key) : null;
  }
  return null;
}
