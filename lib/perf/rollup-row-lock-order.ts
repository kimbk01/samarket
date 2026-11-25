/**
 * `cm_monitoring_rollup_add` 교착(deadlock) 방지 — 보내는 행을 DB 충돌 키 순서로 정렬한다.
 *
 * 2026-11-25 운영 실측(docs/audit/supabase-request-surge-2026-11-18/full-defect-audit-2026-11-25.md F1):
 * 함수는 받은 순서대로 한 행씩 upsert 한다. 여러 인스턴스가 같은 시각에 겹치는 키를 서로 다른 순서로 보내면
 * 서로의 행 잠금을 기다리다 deadlock → 그 묶음 전체가 500 으로 실패하고 셈이 사라졌다(하루 13건).
 * 모든 호출이 같은 순서로 잠그면 교착이 생기지 않는다. 같은 시각·같은 플랫폼이면 충돌 키는 (category, metric, outcome) 이고,
 * 함수가 category·metric 을 소문자로, 모르는 outcome 을 '' 로 바꾸므로 같은 값으로 비교한다.
 */

type RollupKeyRow = { category: string; metric: string; outcome?: string | null };

function lockKeyOf(row: RollupKeyRow): string {
  const outcome = row.outcome === "ok" || row.outcome === "error" ? row.outcome : "";
  return `${String(row.category ?? "").toLowerCase()}\u0000${String(row.metric ?? "").toLowerCase()}\u0000${outcome}`;
}

/** 새 배열로 정렬해 돌려준다(입력은 바꾸지 않음). 비교는 문자 코드 순 — 어느 인스턴스에서나 같은 순서. */
export function sortRollupRowsForLockOrder<T extends RollupKeyRow>(rows: readonly T[]): T[] {
  return rows
    .map((row) => ({ row, key: lockKeyOf(row) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((x) => x.row);
}
