/**
 * 충전 신청 줄 처리 시각 (재감사 R6-f).
 * - 취소: 회원 직접 취소가 `processed_at` 을 쓴다(취소 API). 그 전에 취소된 줄은 `processed_at` 이 비어 있어
 *   상태를 바꾼 시각 `updated_at` 으로 보인다 — 「취소 YYYY-MM-DD HH:mm (PHT)」.
 * - 승인·반려·보류: `processed_at`, 없으면 `approved_at`. 대기 중이면 없음.
 */
import type { PointChargeRequest } from "@/lib/types/point";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";

export type PointChargeProcessedStamp = { kind: "cancelled" | "processed"; at: string };

export function pointChargeProcessedStamp(
  r: Pick<PointChargeRequest, "requestStatus" | "processedAt" | "approvedAt" | "updatedAt">
): PointChargeProcessedStamp | null {
  if (r.requestStatus === "pending" || r.requestStatus === "waiting_confirm") return null;
  if (r.requestStatus === "cancelled") {
    const at = r.processedAt || r.updatedAt || null;
    return at ? { kind: "cancelled", at } : null;
  }
  const at = r.processedAt || r.approvedAt || null;
  return at ? { kind: "processed", at } : null;
}

/** 「YYYY-MM-DD HH:mm (PHT)」 */
export function formatPointChargePht(iso: string): string {
  const s = formatManilaDateTime(iso);
  return s === "—" ? s : `${s} (PHT)`;
}
