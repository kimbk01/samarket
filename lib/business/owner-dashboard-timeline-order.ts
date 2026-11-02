/** 운영 홈 대시보드 주문 행 타입 (서버 시드용 — 예전 미사용 타임라인 컴포넌트에서 분리 · 2026-11-03) */
export type TimelineOrder = {
  id: string;
  order_no: string;
  buyer_user_id: string;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  created_at: string;
  buyer_payment_method?: string | null;
  buyer_payment_method_detail?: string | null;
};
