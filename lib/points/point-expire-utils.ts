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

export type ExpiringPointEntry = { expiresAt: string; amount: number };

/**
 * S42·A8 — 소멸 예정 적립분별 금액(잔액 상한 FIFO 배분).
 * `computeExpiringPointsFromLedger` 와 같은 입력·같은 대상 행을 쓰고, 합은 그 합계와 같다.
 * 현재 잔액을 만료일이 빠른 적립분부터 채운다 → 잔액이 원장 합보다 작으면 **늦은 만료분부터** 깎인다
 * (이미 사용된 포인트를 소멸 예정으로 이중 표시하지 않음). 0 이 된 적립분은 빼고 반환한다.
 */
export function allocateExpiringEntries(
  rows: Array<{ amount: number; expires_at: string | null; expired_amount: number | null }>,
  balance: number,
  nowIso: string = new Date().toISOString()
): ExpiringPointEntry[] {
  const valid = rows
    .filter((r) => Number(r.amount) > 0 && r.expires_at && r.expired_amount == null && String(r.expires_at) > nowIso)
    .map((r) => ({ expiresAt: String(r.expires_at), amount: Math.trunc(Number(r.amount)) }))
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
  let remaining = Math.max(0, Math.trunc(Number(balance) || 0));
  const out: ExpiringPointEntry[] = [];
  for (const e of valid) {
    if (remaining <= 0) break;
    const take = Math.min(e.amount, remaining);
    if (take > 0) out.push({ expiresAt: e.expiresAt, amount: take });
    remaining -= take;
  }
  return out;
}

export type ExpiringPointMonth = { monthKey: string; amount: number; earliestExpiresAt: string };

/**
 * 월별 묶음 — `monthKeyOf(expiresAt)` 는 표시 시간대(필리핀 `Asia/Manila`) 기준 `YYYY-MM`
 * (`mypageDateGroupKey(iso, "month")`). DB 저장값(UTC)은 바꾸지 않는다. 월 오름차순.
 */
export function groupExpiringEntriesByMonth(
  entries: readonly ExpiringPointEntry[],
  monthKeyOf: (iso: string) => string
): ExpiringPointMonth[] {
  const map = new Map<string, ExpiringPointMonth>();
  for (const e of entries) {
    const key = monthKeyOf(e.expiresAt);
    if (!key) continue;
    const cur = map.get(key);
    if (cur) {
      cur.amount += e.amount;
      if (new Date(e.expiresAt).getTime() < new Date(cur.earliestExpiresAt).getTime()) {
        cur.earliestExpiresAt = e.expiresAt;
      }
    } else {
      map.set(key, { monthKey: key, amount: e.amount, earliestExpiresAt: e.expiresAt });
    }
  }
  return [...map.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}
