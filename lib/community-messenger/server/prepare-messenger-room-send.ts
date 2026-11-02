/**
 * S-1 (Owner 2026-11-02) — 텍스트 외 모든 보내기 경로(이미지·파일·음성·스티커·게시글 공유)의 단일 진입점.
 * = 공통 발송 게이트(`assertMessengerRoomSendAllowed`) + 상대가 나간 일반 1:1 이면 상대 되살림.
 * 텍스트는 `sendCommunityMessengerMessage` 가 같은 게이트 결과(`readmitPeerUserId`)로 같은 되살림 함수를 쓴다.
 * 업로드 URL 발급 경로는 게이트만(`readmit:false`) — 실제 메시지 저장 경로에서 되살린다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertMessengerRoomSendAllowed,
  type MessengerSendGuardResult,
} from "@/lib/community-messenger/server/assert-messenger-room-send-allowed";

export async function prepareMessengerRoomSend(input: {
  supabase: SupabaseClient<any>;
  userId: string;
  roomId: string;
  /** false = 판정만(업로드 URL 발급처럼 아직 메시지를 저장하지 않는 경로) */
  readmit?: boolean;
}): Promise<MessengerSendGuardResult> {
  const guard = await assertMessengerRoomSendAllowed(input);
  if (!guard.ok || input.readmit === false || !guard.readmitPeerUserId) return guard;
  const { readmitLeftGeneralDirectPeerForSend } = await import("@/lib/community-messenger/service");
  const readmit = await readmitLeftGeneralDirectPeerForSend({
    supabase: input.supabase,
    roomId: input.roomId,
    senderUserId: input.userId,
    peerUserId: guard.readmitPeerUserId,
  });
  if (!readmit.ok) return { ok: false, error: "room_not_found" };
  return guard;
}
