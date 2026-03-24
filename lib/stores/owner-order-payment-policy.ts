/**
 * 사마켓 매장 주문은 앱 내 결제(PG) 없이 현장·GCash 등 오프라인 정산이므로,
 * 접수(accepted)에 별도 결제 기록을 요구하지 않습니다.
 */
export function ownerAcceptRequiresRecordedPayment(): boolean {
  return false;
}
