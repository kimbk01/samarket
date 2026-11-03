import "server-only";
/**
 * 서버 전용 — 거래 글 공개 자격 변경 방송 (설계 §1-3 · 메신저와 같은 「서버만 발행」).
 * 실패해도 조치 결과는 그대로다(화면은 복귀 재확인으로 맞춘다). 실패는 경고 로그(분당 1회/원인).
 */
import { publishMessengerPrivateBroadcastFromServer } from "@/lib/community-messenger/realtime/private-broadcast-server";
import {
  TRADE_LISTING_VISIBILITY_EVENT,
  TRADE_LISTING_VISIBILITY_TOPIC,
  type TradeListingVisibilityPayload,
  type TradeListingVisibilityReason,
} from "@/lib/trade/listing-visibility/listing-visibility-shared";

export async function publishTradeListingVisibility(
  postId: string,
  visible: boolean,
  reason: TradeListingVisibilityReason
): Promise<void> {
  const id = postId.trim();
  if (!id) return;
  const payload: TradeListingVisibilityPayload = { v: 1, postId: id, visible, reason };
  try {
    await publishMessengerPrivateBroadcastFromServer({
      scope: "trade-listing-visibility",
      messages: [{ topic: TRADE_LISTING_VISIBILITY_TOPIC, event: TRADE_LISTING_VISIBILITY_EVENT, payload }],
      timeoutMs: 2_500,
    });
  } catch {
    /* 발행 실패는 조치를 막지 않는다 */
  }
}

/** 관리자 노출 조치 결과(moderation_state) → 방송 */
export async function publishTradeListingVisibilityForModeration(postId: string, moderationState: string | null | undefined): Promise<void> {
  const s = String(moderationState ?? "");
  if (s === "admin_deleted") return publishTradeListingVisibility(postId, false, "admin_deleted");
  if (s === "admin_hidden") return publishTradeListingVisibility(postId, false, "admin_hidden");
  if (s === "visible") return publishTradeListingVisibility(postId, true, "restored");
}
