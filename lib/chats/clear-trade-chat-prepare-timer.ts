/**
 * 거래 상세 CTA hover prepare timer — unmount/cancel 시 clearTimeout + ref null.
 * 새 abort/registry 없음. 시간값·스케줄 정책은 호출부 유지.
 */
export function clearTradeChatPrepareTimer(timerRef: {
  current: ReturnType<typeof setTimeout> | null;
}): void {
  if (timerRef.current == null) return;
  clearTimeout(timerRef.current);
  timerRef.current = null;
}
