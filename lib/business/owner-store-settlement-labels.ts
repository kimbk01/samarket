/** 매장 오너 정산 UI — `store_settlements.settlement_status` 표시 */
export const OWNER_STORE_SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  scheduled: "지급 예정",
  processing: "처리 중",
  paid: "지급 완료",
  held: "보류",
  cancelled: "취소",
};

export type OwnerStoreSettlementStatusFilter =
  | "all"
  | "scheduled"
  | "processing"
  | "paid"
  | "held"
  | "cancelled";

export const OWNER_STORE_SETTLEMENT_STATUS_FILTERS: {
  id: OwnerStoreSettlementStatusFilter;
  label: string;
}[] = [
  { id: "all", label: "전체" },
  { id: "scheduled", label: "지급 예정" },
  { id: "processing", label: "처리 중" },
  { id: "paid", label: "지급 완료" },
  { id: "held", label: "보류" },
  { id: "cancelled", label: "취소" },
];

export function ownerStoreSettlementStatusChipClass(status: string): string {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-950";
    case "held":
      return "bg-amber-100 text-amber-950";
    case "cancelled":
      return "bg-sam-surface-muted text-sam-muted";
    case "processing":
      return "bg-violet-100 text-violet-950";
    default:
      return "bg-signature/10 text-signature";
  }
}
