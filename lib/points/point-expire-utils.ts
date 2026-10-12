/**
 * 26단계: 포인트 만료 유틸 (만료일 계산, 제외 타입, 라벨)
 */

import type {
  PointExpirePolicy,
  PointExpireEntryTypeExclude,
  PointExpireRunCycle,
  PointExpireExecutionStatus,
  PointExpireLogActionType,
} from "@/lib/types/point-expire";
import type { PointLedgerEntryType } from "@/lib/types/point";

/** 획득일 기준 만료일 계산 (정책 일수 적용) */
export function computeExpiresAt(
  earnedAt: string,
  expireAfterDays: number
): string {
  const d = new Date(earnedAt);
  d.setDate(d.getDate() + expireAfterDays);
  return d.toISOString();
}

/** entryType이 정책의 만료 제외 타입인지 */
export function isEntryTypeExcluded(
  entryType: PointLedgerEntryType,
  excludeEntryTypes: PointExpireEntryTypeExclude[]
): boolean {
  const s = excludeEntryTypes as string[];
  return s.includes(entryType);
}

/** 만료 대상 여부: 양수 금액, 제외 타입 아님, expiresAt 있음, 아직 미만료 */
export function isEntryExpirable(
  entry: { amount: number; entryType: PointLedgerEntryType; expiresAt?: string; isExpired?: boolean },
  policy: PointExpirePolicy
): boolean {
  if (entry.amount <= 0) return false;
  if (isEntryTypeExcluded(entry.entryType, policy.excludeEntryTypes)) return false;
  if (!entry.expiresAt) return false;
  if (entry.isExpired) return false;
  return true;
}

export const POINT_EXPIRE_RUN_CYCLE_LABELS: Record<PointExpireRunCycle, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
};

export const POINT_EXPIRE_EXECUTION_STATUS_LABELS: Record<
  PointExpireExecutionStatus,
  string
> = {
  simulated: "시뮬레이션",
  success: "실행완료",
  skipped: "스킵",
  failed: "실패",
};

export const POINT_EXPIRE_LOG_ACTION_LABELS: Record<
  PointExpireLogActionType,
  string
> = {
  preview: "미리보기",
  expire: "만료",
  rollback: "롤백",
};

/** 만료 예정 요약 계산 (미래 만료일 + 미만료 항목) */
export function getUpcomingExpiringSummary(
  userId: string,
  entries: Array<{ userId: string; amount: number; expiresAt?: string; isExpired?: boolean }>
): { totalExpiringPoint: number; nearestExpireAt: string | null; expiringEntriesCount: number } {
  const now = new Date().toISOString();
  const valid = entries.filter(
    (e) =>
      e.userId === userId &&
      e.amount > 0 &&
      e.expiresAt &&
      !e.isExpired &&
      e.expiresAt > now
  );
  if (valid.length === 0) {
    return { totalExpiringPoint: 0, nearestExpireAt: null, expiringEntriesCount: 0 };
  }
  const totalExpiringPoint = valid.reduce((s, e) => s + e.amount, 0);
  const sorted = [...valid].sort(
    (a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime()
  );
  const nearestExpireAt = sorted[0]?.expiresAt ?? null;
  return {
    totalExpiringPoint,
    nearestExpireAt,
    expiringEntriesCount: valid.length,
  };
}

/**
 * SSOT-19 F-17 — 소멸 예정 포인트(서버 계산).
 * 대상: 양수 적립 원장 중 expires_at 이 있고, 아직 만료 처리되지 않았고(expired_amount null), 만료일이 미래인 행.
 * 합계는 현재 잔액(원장 합)을 넘지 않는다 — 이미 사용된 포인트를 소멸 예정으로 이중 표시하지 않음.
 * 기간 필터는 두지 않는다(기존 화면 정의: 미래 만료 전체). 개별 적립분의 사용 차감 순서(FIFO)는
 * 기존 정책에 정의가 없어 적용하지 않는다 — 상한(잔액)만 적용.
 */
export function computeExpiringPointsFromLedger(
  rows: Array<{ amount: number; expires_at: string | null; expired_amount: number | null }>,
  balance: number,
  nowIso: string = new Date().toISOString()
): { totalExpiringPoint: number; nearestExpireAt: string | null; expiringEntriesCount: number } {
  const valid = rows.filter(
    (r) => Number(r.amount) > 0 && r.expires_at && r.expired_amount == null && String(r.expires_at) > nowIso
  );
  if (valid.length === 0) return { totalExpiringPoint: 0, nearestExpireAt: null, expiringEntriesCount: 0 };
  const raw = valid.reduce((s, r) => s + Number(r.amount), 0);
  const cap = Math.max(0, Math.trunc(Number(balance) || 0));
  const nearest = valid
    .map((r) => String(r.expires_at))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
  return {
    totalExpiringPoint: Math.min(raw, cap),
    nearestExpireAt: nearest ?? null,
    expiringEntriesCount: valid.length,
  };
}
