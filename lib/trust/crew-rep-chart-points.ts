/**
 * CREW REP 90일 그래프 점 계산 (순수 함수) — 실기 결함 F3 (2026-11-16).
 * 시작점 = 기간 안 첫 변화의 「바뀌기 전 점수」. 기간 전 마지막 점수(carry)가 있으면 그것.
 * 그래서 85 → 55 이력이면 그래프가 85 에서 시작해 그 시점에 55 로 내려간다(예전: 55 평평).
 */

export type CrewRepChartHistoryRow = { at: string; before: number | null; after: number; cause: string };
export type CrewRepChartPoint = { t: number; v: number };

export function buildCrewRepChartPoints(
  history: CrewRepChartHistoryRow[],
  current: number,
  nowMs: number,
  windowDays = 90
): CrewRepChartPoint[] {
  const startMs = nowMs - windowDays * 86_400_000;
  const carry = history.find((h) => h.cause === "carry");
  const changes = history
    .filter((h) => h.cause !== "carry")
    .map((h) => ({ t: new Date(h.at).getTime(), before: h.before, v: h.after }))
    .filter((p) => Number.isFinite(p.t) && p.t >= startMs && p.t <= nowMs)
    .sort((a, b) => a.t - b.t);

  const startValue = carry
    ? carry.after
    : changes[0]
      ? changes[0].before ?? changes[0].v
      : current;

  return [{ t: startMs, v: startValue }, ...changes.map((c) => ({ t: c.t, v: c.v })), { t: nowMs, v: current }];
}
