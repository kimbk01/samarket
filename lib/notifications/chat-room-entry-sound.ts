/**
 * 채팅 상세 진입 — pending hydrate + 재생 중 타이머를 같은 lifecycle 에서 무효화.
 * CONTRACT: 방 진입 자체는 음을 내지 않으며, 진입 전 예약된 수신음도 재생하지 않는다.
 */

import {
  invalidatePendingNotificationSoundPlayback,
  stopNotificationPlayback,
} from "@/lib/notifications/notification-sound-engine";

/**
 * Community / Trade / Store-order 채팅 상세 진입·전환 시 단일 권위.
 * `invalidate` 가 내부에서 stop 을 호출하므로 순서는 invalidate → (명시적) stop 유지.
 */
export function invalidateChatRoomEntryInAppSound(): void {
  invalidatePendingNotificationSoundPlayback();
  stopNotificationPlayback();
}
