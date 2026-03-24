/** 인앱 알림 목록 UI용 짧은 라벨 */
export function notificationTypeLabel(notificationType: string): string {
  switch (notificationType) {
    case "commerce":
      return "매장 주문";
    case "chat":
      return "채팅";
    case "status":
      return "상태";
    case "review":
      return "리뷰";
    case "report":
      return "신고";
    case "system":
      return "시스템";
    default:
      return notificationType || "알림";
  }
}

/** commerce 알림 meta.kind → 부가 라벨 (없으면 null) */
export function commerceMetaKindLabel(kind: unknown): string | null {
  if (typeof kind !== "string" || !kind) return null;
  const m: Record<string, string> = {
    store_order_created: "새 주문",
    store_order_payment_completed: "결제 완료",
    store_order_buyer_cancelled: "고객 취소",
    store_order_refund_requested: "환불 요청",
    store_order_owner_status: "주문 진행",
    store_order_payment_failed: "결제 실패",
    store_order_refund_approved: "환불 완료",
    store_order_auto_completed: "자동 완료",
  };
  return m[kind] ?? null;
}
