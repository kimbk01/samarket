import type { MessageKey } from "@/lib/i18n/messages";

/** 찜 허브 1단 — 중고거래 | 스토어 (당근 관심목록 구조) */
export type FavoritesHubSegmentId = "trade" | "store";

export const FAVORITES_HUB_SEGMENTS: {
  id: FavoritesHubSegmentId;
  labelKey: MessageKey;
}[] = [
  { id: "trade", labelKey: "ui_fav_hub_segment_trade" },
  { id: "store", labelKey: "ui_fav_hub_segment_store" },
];
