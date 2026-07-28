"use client";

/**
 * LEGACY REMOVED (2026-07-28): hub badge snapshot 증가로 인앱 채팅음을 재생하지 않는다.
 * 수신음 권위 = message/notification INSERT · CM participants unread 증가.
 * 마운트는 `MessagingGlobalChrome` 에서 제거됨 — 파일은 import 깨짐 방지용 stub.
 */
export function GlobalOrderChatUnreadSound(_props: { enabled?: boolean }) {
  return null;
}
