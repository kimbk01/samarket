/**
 * R8-h (재감사 2026-11-03) — Cash 충전 승인·반려를 같은 결정으로 다시 처리(idempotent)하면 사장님 알림을 다시 보내지 않는다.
 * 첫 처리에서 이미 알림이 나갔기 때문 (같은 승인 재처리 → 완료 알림 2번).
 */
export function shouldNotifyOwnerOnCashChargeDecision(input: {
  idempotent: boolean | null | undefined;
  hasNotifyTarget: boolean;
}): boolean {
  return input.hasNotifyTarget && input.idempotent !== true;
}
