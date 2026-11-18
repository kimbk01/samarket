/**
 * 레거시 거래 채팅 URL 리다이렉트 목적지 (서버 전용 · RSC 리다이렉트 페이지에서만 import).
 *
 * 쓰는 곳: `/mypage/purchases/[chatId]` · `/philife/purchases/[chatId]` · `/mypage/trade/chat/[roomId]` ·
 * `/mypage/trade/chat/compose?roomId=`. 레거시 id(`product_chats.id` / `chat_rooms.id`)로 메신저 방을 열면
 * URL 이 정규 id 로 바뀌기 전까지 방 안인데도 소리·안 읽음이 날 수 있어, 처음부터 정규 메신저 방 id 로 보낸다.
 *
 * 열람자가 그 거래의 판매자·구매자이고 정규 방이 해석될 때만 정규 id (`resolveLegacyTradeChatMessengerRoomIdForViewer`).
 * 그 외(비로그인·비참여자·이미 메신저 방 id·해석 실패·서버 설정 없음)는 기존 경로 그대로.
 */
import type { ChatRoomSource } from "@/lib/types/chat";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { resolveLegacyTradeChatMessengerRoomIdForViewer } from "@/lib/trade/trade-messenger-room-link-server";

/** `roomId` 는 호출부가 `parseRoomId` 로 검증한 값 */
export async function resolveLegacyTradeChatRedirectHref(
  roomId: string,
  sourceHint: ChatRoomSource | null
): Promise<string> {
  const id = roomId.trim();
  if (!id) return tradeHubChatRoomHref("");
  let messengerRoomId: string | null = null;
  const sb = tryCreateSupabaseServiceClient();
  if (sb) {
    try {
      const viewerUserId = await getOptionalAuthenticatedUserId();
      messengerRoomId = await resolveLegacyTradeChatMessengerRoomIdForViewer(
        sb as import("@supabase/supabase-js").SupabaseClient<any>,
        id,
        viewerUserId
      );
    } catch {
      messengerRoomId = null;
    }
  }
  if (messengerRoomId) return tradeHubChatRoomHref(messengerRoomId);
  return tradeHubChatRoomHref(id, sourceHint);
}
