/**
 * 관리자 포인트 원장 목록(거래·커뮤니티) 조건 합계 — 「충전 얼마 · 지급 얼마 · 사용 얼마 …」 칸별 (실기 A-7 FAIL · Owner 2026-11-03).
 * 이전: DB 함수 합계가 들어온·나간 2칸뿐.
 * DB 함수(`admin_point_ledger_domain_page`)가 목록과 같은 1회 호출 안에서 종류별 합(`sums_by_kind`)을 주고,
 * 여기서 회원 포인트 화면과 같은 칸 분류(`pointPeriodBucket` · 확정 보류 = 「사용」)로 나눈다 — R7 계약(1회 호출·상한 없음) 유지.
 * SQL 짝: supabase/migrations/20271104140000_admin_point_ledger_domain_page_sums_by_kind.sql
 */
import { pointPeriodBucket } from "@/lib/points/point-period-history";
import type { AdminPointBucketSums } from "@/lib/admin/points/admin-point-bucket-line";

export type { AdminPointBucketSums };

export type AdminPointSumsByKindRow = {
  entry_type?: string | null;
  related_type?: string | null;
  hold_captured?: boolean | null;
  amount_in?: number | string | null;
  amount_out?: number | string | null;
  count?: number | string | null;
};

const toInt = (v: unknown) => Math.trunc(Number(v ?? 0) || 0);

/** `sums_by_kind` → 칸별 합계. 없으면(구 DB 함수) null — 화면은 칸별 줄을 숨긴다. */
export function adminPointBucketsFromSumsByKind(kinds: unknown): AdminPointBucketSums | null {
  if (!Array.isArray(kinds)) return null;
  const s: AdminPointBucketSums = { charge: 0, grant: 0, refund: 0, use: 0, reclaim: 0, hold: 0, rows: 0 };
  for (const raw of kinds as AdminPointSumsByKindRow[]) {
    const et = String(raw.entry_type ?? "");
    const rt = String(raw.related_type ?? "");
    const captured = raw.hold_captured === true;
    s.rows += toInt(raw.count);
    for (const amount of [toInt(raw.amount_in), toInt(raw.amount_out)]) {
      const b = pointPeriodBucket(et, rt, amount, captured);
      if (!b) continue;
      // 보류 중은 순값(보류 + · 해제 −) — 회원 화면 computePointPeriodSummary 와 같은 규칙
      if (b === "hold") s.hold -= amount;
      else s[b] += Math.abs(amount);
    }
  }
  return s;
}
