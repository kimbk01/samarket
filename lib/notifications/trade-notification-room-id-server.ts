/**
 * 거래 상태 알림 링크용 방 id (서버 전용 · 조회 전용).
 *
 * 알림을 레거시 거래방 id(`product_chats.id` / `chat_rooms.id`)로 열면 방 스냅샷이 URL 을 정규 id 로 바꾸기
 * 전까지 활성 방·알림 표면 id 가 정규 방 id 와 달라 방 안인데도 소리·안 읽음이 날 수 있다.
 * 순서: 이미 아는 메신저 방 id → Admin·내역과 같은 해석기(`resolveTradeMessengerRoomForAdmin`) → 레거시 id.
 * 방 생성·FK 보정 없음. sb 는 service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTradeMessengerRoomForAdmin } from "@/lib/admin-chats/trade-messenger-room";

export async function resolveTradeNotificationMessengerRoomId(
  sb: SupabaseClient<any>,
  knownMessengerRoomId: string | null | undefined,
  legacyRoomId: string
): Promise<string> {
  const known = typeof knownMessengerRoomId === "string" ? knownMessengerRoomId.trim() : "";
  if (known) return known;
  const legacy = legacyRoomId.trim();
  if (!legacy) return legacy;
  try {
    const resolved = await resolveTradeMessengerRoomForAdmin(sb, legacy);
    return resolved.messengerRoomId?.trim() || legacy;
  } catch {
    return legacy;
  }
}
