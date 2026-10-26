/**
 * D-6 (docs/audit/messenger-2026-10-26-remaining-reaudit-plan.md §1 · Owner 승인 2026-10-26):
 * 보관한 방에 새 메시지·부재중이 오면 받는 사람 목록으로 돌린다 — 서버 DB 함수
 * (`community_messenger_send_text_message` · `dibay_append_room_message_atomic`)와 같은 규칙을 목록 실시간에도 적용.
 * 받는 사람(내가 보낸 것 아님) · 알림 켜짐 · 차단 숨김 아님 · 통화 기록은 부재중만.
 */
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export function incomingRealtimeMessageUnarchivesRoom(args: {
  room: Pick<CommunityMessengerRoomSummary, "isArchivedByViewer" | "isMuted" | "isBlockedHiddenByViewer">;
  messageRow: Record<string, unknown>;
  viewerUserId: string | null | undefined;
}): boolean {
  if (!args.room.isArchivedByViewer) return false;
  if (args.room.isMuted === true || args.room.isBlockedHiddenByViewer === true) return false;
  const viewer = String(args.viewerUserId ?? "").trim();
  const sender = typeof args.messageRow.sender_id === "string" ? args.messageRow.sender_id.trim() : "";
  if (!viewer || !sender || sender === viewer) return false;
  if (args.messageRow.message_type === "call_stub") {
    const meta = args.messageRow.metadata;
    const status =
      meta && typeof meta === "object" && typeof (meta as { callStatus?: unknown }).callStatus === "string"
        ? (meta as { callStatus: string }).callStatus.trim().toLowerCase()
        : "";
    return status === "missed";
  }
  return true;
}
