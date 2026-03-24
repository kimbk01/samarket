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
