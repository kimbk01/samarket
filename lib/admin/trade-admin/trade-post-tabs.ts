/**
 * 거래 게시물 상태 탭·라벨 (설계 v2 §C-2 · §D-3). 클라이언트·서버 공용 — DB 접근 없음.
 * 판매 단계 · 관리자 노출 · 판매자 노출을 섞지 않는다.
 */

import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 키 표 → 한국어 이름 표 (기존 `*_LABELS` 호출부 호환 — 새 화면은 `*_LABEL_KEYS` + `t(key)`) */
function koLabels<K extends string>(keys: Record<K, MessageKey>): Record<K, string> {
  return Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, translate("ko", v as MessageKey)])) as Record<K, string>;
}

export const TRADE_POST_TABS = [
  "all",
  "visible",
  "selling",
  "reserved",
  "sold",
  "admin_hidden",
  "admin_deleted",
  "owner_hidden",
  "owner_deleted",
  "reported",
  "unclassified",
] as const;
export type TradePostTab = (typeof TRADE_POST_TABS)[number];

/** 탭 이름 — 카탈로그 키 (화면에서 `t(key)`) */
export const TRADE_POST_TAB_LABEL_KEYS: Record<TradePostTab, MessageKey> = {
  all: "admin_trade_post_tab_all",
  visible: "admin_trade_post_tab_visible",
  selling: "admin_trade_post_tab_selling",
  reserved: "admin_trade_post_tab_reserved",
  sold: "admin_trade_post_tab_sold",
  admin_hidden: "admin_trade_post_tab_admin_hidden",
  admin_deleted: "admin_trade_post_tab_admin_deleted",
  owner_hidden: "admin_trade_post_tab_owner_hidden",
  owner_deleted: "admin_trade_post_tab_owner_deleted",
  reported: "admin_trade_post_tab_reported",
  unclassified: "admin_trade_post_tab_unclassified",
};

/** 탭 이름(한국어) — 기존 호출부 호환 */
export const TRADE_POST_TAB_LABELS: Record<TradePostTab, string> = koLabels(TRADE_POST_TAB_LABEL_KEYS);

export function parseTradePostTab(raw: string | null | undefined): TradePostTab {
  const v = String(raw ?? "").trim();
  return (TRADE_POST_TABS as readonly string[]).includes(v) ? (v as TradePostTab) : "all";
}

export const TRADE_POST_SORTS = ["latest", "updated", "price_desc", "price_asc", "views"] as const;
export type TradePostSort = (typeof TRADE_POST_SORTS)[number];
export const TRADE_POST_SORT_LABEL_KEYS: Record<TradePostSort, MessageKey> = {
  latest: "admin_trade_post_sort_latest",
  updated: "admin_trade_post_sort_updated",
  price_desc: "admin_trade_post_sort_price_desc",
  price_asc: "admin_trade_post_sort_price_asc",
  views: "admin_trade_post_sort_views",
};
export const TRADE_POST_SORT_LABELS: Record<TradePostSort, string> = koLabels(TRADE_POST_SORT_LABEL_KEYS);
export function parseTradePostSort(raw: string | null | undefined): TradePostSort {
  const v = String(raw ?? "").trim();
  return (TRADE_POST_SORTS as readonly string[]).includes(v) ? (v as TradePostSort) : "latest";
}

export const SELLER_STAGE_LABEL_KEYS: Record<string, MessageKey> = {
  inquiry: "admin_trade_post_stage_inquiry",
  negotiating: "admin_trade_post_stage_negotiating",
  reserved: "admin_trade_post_stage_reserved",
  completed: "admin_trade_post_stage_completed",
};
export const SELLER_STAGE_LABELS: Record<string, string> = koLabels(SELLER_STAGE_LABEL_KEYS);

export const MODERATION_STATE_LABEL_KEYS: Record<string, MessageKey> = {
  visible: "admin_trade_post_moderation_visible",
  admin_hidden: "admin_trade_post_moderation_admin_hidden",
  admin_deleted: "admin_trade_post_moderation_admin_deleted",
};
export const MODERATION_STATE_LABELS: Record<string, string> = koLabels(MODERATION_STATE_LABEL_KEYS);

export const OWNER_STATE_LABEL_KEYS: Record<string, MessageKey> = {
  owner_hidden: "admin_trade_post_owner_state_owner_hidden",
  owner_deleted: "admin_trade_post_owner_state_owner_deleted",
};
export const OWNER_STATE_LABELS: Record<string, string> = { none: "", ...koLabels(OWNER_STATE_LABEL_KEYS) };

/** 관리자 노출 조치 — 현재 상태에서 가능한 조치만 (서버 함수 admin_trade_post_moderate 와 같은 규칙) */
export type TradePostModerationAction = "hide" | "unhide" | "delete" | "undelete";

export function allowedTradePostModerationActions(moderationState: string): TradePostModerationAction[] {
  switch (moderationState) {
    case "visible":
      return ["hide", "delete"];
    case "admin_hidden":
      return ["unhide", "delete"];
    case "admin_deleted":
      return ["undelete"];
    default:
      return [];
  }
}

export const TRADE_POST_MODERATION_ACTION_LABEL_KEYS: Record<TradePostModerationAction, MessageKey> = {
  hide: "admin_trade_post_action_hide",
  unhide: "admin_trade_post_action_unhide",
  delete: "admin_trade_post_action_delete",
  /** D-6: 삭제 취소 = 관리자 숨김으로 돌아감 — 버튼 이름에 결과를 쓴다 */
  undelete: "admin_trade_post_action_undelete",
};
export const TRADE_POST_MODERATION_ACTION_LABELS: Record<TradePostModerationAction, string> = koLabels(
  TRADE_POST_MODERATION_ACTION_LABEL_KEYS
);
