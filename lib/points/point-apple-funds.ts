/**
 * Apple 결제로 충전한 Point 는 디지털 광고·홍보 전용 (DB: 20271107110000_point_apple_funds_digital_only.sql).
 * 상품권·매장 주문 등 그 밖의 차감은 「총 Point − Apple 충전분」 안에서만 되고, 넘으면 DB 가 전체 차감을 거절한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const POINT_APPLE_FUNDS_RESTRICTED = "point_apple_funds_restricted" as const;

export type PointAppleFundSummary = {
  totalPoints: number;
  appleOnlyPoints: number;
  /** 상품권·주문 등 광고·홍보 외 결제에 쓸 수 있는 Point */
  generalAvailablePoints: number;
};

export function isPointAppleFundsRestrictedError(message: string | null | undefined): boolean {
  return String(message ?? "").includes(POINT_APPLE_FUNDS_RESTRICTED);
}

function toInt(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
}

export function parsePointAppleFundSummary(data: unknown): PointAppleFundSummary | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  if (!("total" in row)) return null;
  const totalPoints = toInt(row.total);
  const appleOnlyPoints = Math.max(0, toInt(row.apple_only));
  return {
    totalPoints,
    appleOnlyPoints,
    generalAvailablePoints: Math.max(0, toInt(row.general_available)),
  };
}

/** service-role 클라이언트 전용. 함수가 아직 없거나 실패하면 null (호출부는 기존 표시를 유지). */
export async function readPointAppleFundSummary(
  sb: SupabaseClient,
  userId: string
): Promise<PointAppleFundSummary | null> {
  const uid = userId.trim();
  if (!uid) return null;
  const { data, error } = await sb.rpc("point_apple_fund_summary", { p_user_id: uid });
  if (error) return null;
  return parsePointAppleFundSummary(data);
}
