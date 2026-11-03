/**
 * Coin 원장 행의 「연결 대상」을 같은 거래끼리 같은 번호로 맞춘다 — 관리자·사장님 공용 (실기 2026-11-03).
 *
 * - Coin→Cash 전환: Coin 행 related_id 는 요청 멱등 키(sp2bc:…), Cash 행 related_id 는 이 Coin 원장 id.
 *   → Coin 행도 자기 원장 id 로 표시해 두 행이 같은 번호.
 * - Coin 출금: 신청(보류) 행 related_id 는 요청 멱등 키(coin_withdrawal:…), 해제·지급 행은 출금 신청 id.
 *   → 보류 원장 id(coin_withdrawal_requests.hold_ledger_id)로 출금 신청 id 를 찾아 맞춘다.
 * 원장 데이터는 바꾸지 않는다 (표시 단계에서만).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type LinkableCoinRow = {
  id: string;
  entryKind: string;
  relatedType: string | null;
  relatedId: string | null;
};

export function canonicalCoinConversionLink<T extends LinkableCoinRow>(row: T): T {
  if (row.entryKind.toUpperCase() !== "CONVERT_TO_BUSINESS_CASH") return row;
  return { ...row, relatedType: "store_economic_point_ledger", relatedId: row.id };
}

export async function linkCoinWithdrawalRequestRows<T extends LinkableCoinRow>(
  sb: SupabaseClient,
  rows: T[]
): Promise<void> {
  const holdRows = rows.filter((r) => r.entryKind.toUpperCase() === "WITHDRAWAL_REQUEST");
  if (holdRows.length === 0) return;
  const { data, error } = await sb
    .from("coin_withdrawal_requests")
    .select("id, hold_ledger_id")
    .in(
      "hold_ledger_id",
      holdRows.map((r) => r.id)
    );
  // 조회 실패 시 원래 값 그대로 (잘못 연결하지 않음)
  if (error || !data) return;
  const byHold = new Map(
    (data as Array<{ id: string; hold_ledger_id: string | null }>).map((w) => [String(w.hold_ledger_id), String(w.id)])
  );
  for (const r of holdRows) {
    const wid = byHold.get(r.id);
    if (wid) {
      r.relatedType = "coin_withdrawal";
      r.relatedId = wid;
    }
  }
}
