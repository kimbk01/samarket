/**
 * 관리자 메시지 숨김/해제 성공 직후 — 사용자 앱 방 목록 미리보기·부트스트랩 캐시 정합.
 * 서버 전용. 실패해도 조치 자체(DB 갱신·감사)는 유지하고 로그만 남긴다.
 */
import "server-only";
import { syncCommunityMessengerRoomAfterAdminMessageVisibility } from "@/lib/community-messenger/service";

export async function syncRoomAfterAdminMessageVisibility(roomId: string): Promise<void> {
  try {
    await syncCommunityMessengerRoomAfterAdminMessageVisibility(roomId);
  } catch (err) {
    console.error("[admin-message-hide] room_sync_failed", {
      roomId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
