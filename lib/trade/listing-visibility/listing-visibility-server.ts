import "server-only";
/**
 * 서버 전용 — 거래 글 공개 자격 변경 방송 (설계 §1-3 · 메신저와 같은 「서버만 발행」).
 * 실패해도 조치 결과는 그대로다(화면은 복귀 재확인으로 맞춘다). 실패는 경고 로그(분당 1회/원인).
 */
import { publishMessengerPrivateBroadcastFromServer } from "@/lib/community-messenger/realtime/private-broadcast-server";
import { syncTradeRoomItemStateLabels } from "@/lib/trade/listing-visibility/listing-visibility-room-sync";
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
  /** 설계 G2: 그 글의 거래 채팅방 정보(글 상태 문구)도 맞춘다 — 나중에 여는 방·다른 기기도 맞게 */
  try {
    const res = await syncTradeRoomItemStateLabels(id);
    if (res && res.failed > 0) console.warn("[trade-listing-visibility] room summary sync failed", { postId: id, ...res });
  } catch (e) {
    console.warn("[trade-listing-visibility] room summary sync error", e instanceof Error ? e.message : e);
  }
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
