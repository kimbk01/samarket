/**
 * 서버 접속 기록 행 → 「마지막 접속」 시각 = `last_seen_at`·`last_ping_at`·`updated_at` 중 가장 늦은 시각.
 * `last_seen_at` 은 정상 종료 신호 때만 쓰여, 앱 강제 종료·OS 종료 뒤에는 옛 값으로 남는다 — 하트비트(`last_ping_at`·`updated_at`)가 더 늦으면 그것이 마지막으로 앱에 있었던 시각.
 * @see docs/audit/messenger-direct-header-presence-audit-plan-2026-11-16.md §10 H1
 */
export function resolvePresenceLastSeenAtFromDbRow(row: {
  last_seen_at: string | null | undefined;
  last_ping_at?: string | null | undefined;
  updated_at: string | null | undefined;
}): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const raw of [row.last_seen_at, row.last_ping_at, row.updated_at]) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v) continue;
    const ms = Date.parse(v);
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = v;
    }
  }
  return best;
}
