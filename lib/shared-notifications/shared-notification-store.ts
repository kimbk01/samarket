/**
 * 레거시 인메모리 알림 버퍼는 제거되었습니다.
 * 상용 알림은 Supabase·`/api/me/notifications` 원장만 사용합니다.
 */
export function resetSharedNotifications(): void {
  // 과거 데모 스토어(`shared-order-store`) 초기화 호출 호환용 no-op
}
