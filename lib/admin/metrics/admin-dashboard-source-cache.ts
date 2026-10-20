/**
 * 대시보드 집계 출처 짧은 캐시 (자동 갱신 부하 방지) — 서버 인스턴스 메모리.
 *
 * - 키 = 권한 범위(최고관리자 / 권한 키 정렬) + 기간(PHT 날짜) + 출처. 권한·기간이 다르면 절대 공유하지 않는다.
 * - 같은 키의 동시 요청은 진행 중인 한 번의 집계를 함께 기다린다 (여러 관리자 · 같은 관리자 여러 탭).
 * - 실패한 집계는 캐시하지 않는다 (다음 요청이 다시 읽는다).
 * - `fresh` (수동 새로고침) 는 캐시를 건너뛰고 새로 읽어 캐시를 갱신한다.
 * - 처리 대기·지표만 캐시한다. 추세·최근 활동·공지는 자동 갱신 대상이 아니라 그대로 읽는다.
 */
import type { AdminActionQueuePermissionScope } from "@/lib/admin/admin-action-queue";
import type { AdminDashboardSources } from "@/lib/admin/metrics/build-admin-dashboard-overview";
import type { AdminDashboardPeriodRange } from "@/lib/admin/metrics/dashboard-period";

/** 자동 갱신 주기(60초)보다 짧게 — 한 관리자 화면에서 두 번 연속 같은 값이 나오지 않게 */
export const ADMIN_DASHBOARD_SOURCE_CACHE_TTL_MS = 20_000;
const MAX_ENTRIES = 300;

type Entry = { at: number; value: Promise<unknown> };
const store = new Map<string, Entry>();

export function adminDashboardScopeCacheKey(scope: AdminActionQueuePermissionScope): string {
  return scope.isSuperAdmin ? "super" : `perm:${[...scope.permissions].sort().join(",")}`;
}

function prune(now: number) {
  if (store.size <= MAX_ENTRIES) return;
  for (const [k, e] of store) if (now - e.at >= ADMIN_DASHBOARD_SOURCE_CACHE_TTL_MS) store.delete(k);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function readThroughAdminDashboardCache<T>(
  key: string,
  load: () => Promise<T>,
  opts: { fresh?: boolean; now?: number } = {}
): Promise<T> {
  const now = opts.now ?? Date.now();
  const hit = store.get(key);
  if (!opts.fresh && hit && now - hit.at < ADMIN_DASHBOARD_SOURCE_CACHE_TTL_MS) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: now, value });
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  prune(now);
  return value;
}

/** 테스트 전용 — 캐시 비우기 */
export function clearAdminDashboardSourceCache() {
  store.clear();
}

export function withAdminDashboardSourceCache(
  sources: AdminDashboardSources,
  input: { scope: AdminActionQueuePermissionScope; range: AdminDashboardPeriodRange; fresh?: boolean }
): AdminDashboardSources {
  const base = `${adminDashboardScopeCacheKey(input.scope)}|${input.range.period}|${input.range.fromDay}|${input.range.toDay}`;
  const fresh = input.fresh === true;
  return {
    ...sources,
    metrics: (key) => readThroughAdminDashboardCache(`metrics:${key}|${base}`, () => sources.metrics(key), { fresh }),
    queue: () => readThroughAdminDashboardCache(`queue|${base}`, () => sources.queue(), { fresh }),
  };
}
