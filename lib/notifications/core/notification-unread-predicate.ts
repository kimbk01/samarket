/**
 * C4 읽음 계약 — 회원 알림 「미읽음」 판정 1개 (docs/audit/notification-system-ssot-hardlock-reaudit-2026-11-01.md §3 C4).
 * 종 숫자(load-bell-explain-unread-events)·전체 탭 숫자·목록 행·「미읽음만」 조회가 모두 이 정의를 쓴다:
 *   unread = true AND read_at IS NULL
 * (이전: 분류 탭·미읽음 목록은 read_at 만 봐서 종 숫자와 정의가 달랐다.)
 */
export const NOTIFICATION_EVENT_UNREAD_DEFINITION = "unread = true AND read_at IS NULL" as const;

export function isNotificationEventUnread(row: { unread?: boolean | null; read_at?: string | null }): boolean {
  return row.unread !== false && !row.read_at;
}
