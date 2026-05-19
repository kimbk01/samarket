/** `GET /api/me/store-settlements` 행 — 오너 UI·요약 공용 */
export type OwnerStoreSettlementRow = {
  id: string;
  store_id: string;
  store_name: string;
  order_id: string;
  order_no: string;
  gross_amount: number;
  fee_amount: number;
  settlement_amount: number;
  platform_fee_amount?: number;
  fixed_fee_amount?: number;
  delivery_income_amount?: number;
  refund_amount?: number;
  net_settlement_amount?: number;
  settlement_status: string;
  settlement_due_date: string;
  paid_at: string | null;
  hold_reason: string | null;
  payout_method?: string | null;
  payout_reference?: string | null;
  payout_confirmed_at?: string | null;
  payout_note?: string | null;
  created_at: string;
};

export type OwnerStoreSettlementsMeta = {
  pending_accept_count?: number;
  refund_requested_count?: number;
  pending_delivery_count?: number;
  settlement_fee_percent?: number;
  settlement_delay_days?: number;
  store_name?: string;
};
