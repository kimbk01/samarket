/**
 * `GET /api/community-messenger/home-sync` 서버 지연 원인 분해용 로그.
 * 켜기: `SAMARKET_LOG_HOME_SYNC_BREAKDOWN=1` (서버 프로세스 env)
 */

export function homeSyncBreakdownEnabled(): boolean {
  return process.env.SAMARKET_LOG_HOME_SYNC_BREAKDOWN === "1";
}

export function logHomeSyncBreakdown(
  phase: string,
  ms: number,
  extra?: Record<string, unknown>
): void {
  if (!homeSyncBreakdownEnabled()) return;
  console.info(
    "[home-sync:breakdown]",
    JSON.stringify({ phase, ms: Math.round(ms * 1000) / 1000, ...(extra ?? {}) })
  );
}

export function logHomeSyncBreakdownSummary(payload: {
  tier: string;
  rows: Array<{ phase: string; ms: number }>;
  dbQueryCountEstimate?: number;
  notes?: string;
}): void {
  if (!homeSyncBreakdownEnabled()) return;
  const sorted = [...payload.rows].sort((a, b) => b.ms - a.ms);
  const slowest = sorted[0];
  console.info(
    "[home-sync:breakdown:summary]",
    JSON.stringify({
      tier: payload.tier,
      slowestPhase: slowest?.phase ?? null,
      slowestMs: slowest != null ? Math.round(slowest.ms * 1000) / 1000 : null,
      rankedTop: sorted.slice(0, 12).map((r) => ({
        phase: r.phase,
        ms: Math.round(r.ms * 1000) / 1000,
      })),
      dbQueryCountEstimate: payload.dbQueryCountEstimate,
      notes: payload.notes,
    })
  );
}
