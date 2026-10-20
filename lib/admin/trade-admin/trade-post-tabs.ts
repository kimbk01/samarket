/**
 * 거래 게시물 상태 탭·라벨 (설계 v2 §C-2 · §D-3). 클라이언트·서버 공용 — DB 접근 없음.
 * 판매 단계 · 관리자 노출 · 판매자 노출을 섞지 않는다.
 */

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

export const TRADE_POST_TAB_LABELS: Record<TradePostTab, string> = {
  all: "전체",
  visible: "앱 노출 중",
  selling: "판매중",
  reserved: "예약중",
  sold: "거래완료",
  admin_hidden: "관리자 숨김",
  admin_deleted: "관리자 삭제",
  owner_hidden: "판매자 숨김",
  owner_deleted: "판매자 삭제",
  reported: "신고됨",
  unclassified: "분류 확인 필요",
};

export function parseTradePostTab(raw: string | null | undefined): TradePostTab {
  const v = String(raw ?? "").trim();
  return (TRADE_POST_TABS as readonly string[]).includes(v) ? (v as TradePostTab) : "all";
}

export const TRADE_POST_SORTS = ["latest", "updated", "price_desc", "price_asc", "views"] as const;
export type TradePostSort = (typeof TRADE_POST_SORTS)[number];
export const TRADE_POST_SORT_LABELS: Record<TradePostSort, string> = {
  latest: "최신 등록순",
  updated: "최근 수정순",
  price_desc: "가격 높은순",
  price_asc: "가격 낮은순",
  views: "조회 많은순",
};
export function parseTradePostSort(raw: string | null | undefined): TradePostSort {
  const v = String(raw ?? "").trim();
  return (TRADE_POST_SORTS as readonly string[]).includes(v) ? (v as TradePostSort) : "latest";
}

export const SELLER_STAGE_LABELS: Record<string, string> = {
  inquiry: "판매중",
  negotiating: "거래중",
  reserved: "예약중",
  completed: "거래완료",
};

export const MODERATION_STATE_LABELS: Record<string, string> = {
  visible: "노출",
  admin_hidden: "관리자 숨김",
  admin_deleted: "관리자 삭제",
};

export const OWNER_STATE_LABELS: Record<string, string> = {
  none: "",
  owner_hidden: "판매자 숨김",
  owner_deleted: "판매자 삭제",
};

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

export const TRADE_POST_MODERATION_ACTION_LABELS: Record<TradePostModerationAction, string> = {
  hide: "숨김",
  unhide: "숨김 해제",
  delete: "삭제",
  undelete: "삭제 취소",
};
