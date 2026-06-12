/**
 * 개발 모드 전용 어드민 성능·액션 로그.
 * production 기본 출력 금지.
 */

const PREFIX_PERF = "[admin-perf]";
const PREFIX_ACTION = "[admin-action]";

function isDevAdminPerfEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function logAdminRouteEnter(pathname: string, startedAtMs: number): void {
  if (!isDevAdminPerfEnabled()) return;
  const elapsed = Math.round(performance.now() - startedAtMs);
  console.info(`${PREFIX_PERF} route enter time`, { pathname, ms: elapsed });
}

export function logAdminMenuSwitch(fromPath: string, toPath: string, startedAtMs: number): void {
  if (!isDevAdminPerfEnabled()) return;
  const elapsed = Math.round(performance.now() - startedAtMs);
  console.info(`${PREFIX_PERF} menu switch time`, { from: fromPath, to: toPath, ms: elapsed });
}

let apiCallCount = 0;
const apiCallCountsByKey = new Map<string, number>();

export function resetAdminApiCallCountsForDev(): void {
  if (!isDevAdminPerfEnabled()) return;
  apiCallCount = 0;
  apiCallCountsByKey.clear();
}

export function logAdminApiCall(key: string, options?: { duplicate?: boolean }): void {
  if (!isDevAdminPerfEnabled()) return;
  apiCallCount += 1;
  apiCallCountsByKey.set(key, (apiCallCountsByKey.get(key) ?? 0) + 1);
  console.info(`${PREFIX_PERF} api call count`, {
    key,
    total: apiCallCount,
    keyTotal: apiCallCountsByKey.get(key),
    duplicate: options?.duplicate === true,
  });
  if (options?.duplicate) {
    console.warn(`${PREFIX_PERF} duplicate request detected`, { key });
  }
}

export function logAdminMutation(
  action: string,
  phase: "start" | "success" | "fail",
  detail?: Record<string, unknown>
): void {
  if (!isDevAdminPerfEnabled()) return;
  const payload = detail ? { action, ...detail } : { action };
  if (phase === "fail") {
    console.warn(`${PREFIX_ACTION} mutation fail`, payload);
    return;
  }
  console.info(`${PREFIX_ACTION} mutation ${phase}`, payload);
}
