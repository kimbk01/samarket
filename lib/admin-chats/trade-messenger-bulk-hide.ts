/**
 * 채팅 Admin R1 (B · C-1) — 거래 Admin 일괄 숨김/복구를 사용자 방(CM) 메시지에 적용.
 * 서버 전용. 호출 전 라우트에서 권한·사유 검증을 끝낸다. 시스템 메시지는 제외 (레거시 일괄 숨김과 같은 규칙).
 * 발송·참가자·읽음·bump 없음 — `is_hidden_by_admin` 만 상태 조건으로 갱신하고 audit_logs 를 남긴다.
 * 갱신 행이 있으면 방 목록 미리보기·부트스트랩 캐시를 정합한다.
 */
import "server-only";
import { syncRoomAfterAdminMessageVisibility } from "@/lib/admin-community-messenger/sync-room-after-admin-hide";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  CHAT_ADMIN_AUDIT_MESSAGE_HIDE,
  CHAT_ADMIN_AUDIT_MESSAGE_UNHIDE,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { resolveTradeMessengerRoomForAdmin } from "@/lib/admin-chats/trade-messenger-room";

export async function bulkSetTradeMessengerMessagesHidden(
  sb: SupabaseClient<any>,
  req: Request,
  input: { legacyId: string; adminUserId: string; hidden: boolean; reason: string }
): Promise<{ messengerRoomId: string; count: number } | null> {
  const resolved = await resolveTradeMessengerRoomForAdmin(sb, input.legacyId);
  const roomId = resolved.messengerRoomId;
  if (!roomId) return null;
  const { data: updated, error } = await sb
    .from("community_messenger_messages")
    .update({ is_hidden_by_admin: input.hidden })
    .eq("room_id", roomId)
    .eq("is_hidden_by_admin", !input.hidden)
    .neq("message_type", "system")
    .select("id");
  if (error) throw new Error(error.message);
  const ids = ((updated ?? []) as Array<{ id: string }>).map((m) => m.id);
  if (ids.length > 0) await syncRoomAfterAdminMessageVisibility(roomId);
  await appendAdminRouteAudit(sb, req, {
    actorId: input.adminUserId,
    targetType: "community_messenger_room",
    targetId: roomId,
    action: `${input.hidden ? CHAT_ADMIN_AUDIT_MESSAGE_HIDE : CHAT_ADMIN_AUDIT_MESSAGE_UNHIDE}.bulk`,
    before: { is_hidden_by_admin: !input.hidden, count: ids.length },
    after: {
      is_hidden_by_admin: input.hidden,
      count: ids.length,
      messageIds: ids.slice(0, 200),
      reason: input.reason,
      source: `admin_trade_chat:${input.legacyId}`,
    },
  });
  return { messengerRoomId: roomId, count: ids.length };
}
