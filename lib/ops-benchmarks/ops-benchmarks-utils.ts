/**
 * 45단계: 벤치마크·분기·기간 유틸
 */

import { getOpsBenchmarks } from "./mock-ops-benchmarks";
import type { OpsBenchmarkScope, OpsBenchmarkDomain } from "@/lib/types/ops-benchmarks";

/** 분기/연도 기준 최신 벤치마크 날짜 */
export function getLatestBenchmarkDate(scope: OpsBenchmarkScope): string | null {
  const list = getOpsBenchmarks({ scope });
  if (list.length === 0) return null;
  return list.reduce(
    (max, b) => (b.benchmarkDate > max ? b.benchmarkDate : max),
    list[0].benchmarkDate
  );
}

/** 갭이 큰 도메인 순 (우선순위 추천용) */
export function getHighGapDomains(
  scope: OpsBenchmarkScope,
  limit = 5
): { domain: OpsBenchmarkDomain; gapScore: number }[] {
  const list = getOpsBenchmarks({ scope });
  const byDomain = list.reduce<Record<string, number>>((acc, b) => {
    const existing = acc[b.domain];
    if (existing === undefined || b.gapScore > existing)
      acc[b.domain] = b.gapScore;
    return acc;
  }, {});
  return (Object.entries(byDomain) as [OpsBenchmarkDomain, number][])
    .filter(([, gap]) => gap > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, gapScore]) => ({ domain, gapScore }));
}

/** 현재 분기 라벨 */
export function getCurrentQuarterLabel(): string {
  const m = new Date().getMonth();
  const y = new Date().getFullYear();
  if (m < 3) return `${y} Q1`;
  if (m < 6) return `${y} Q2`;
  if (m < 9) return `${y} Q3`;
  return `${y} Q4`;
}
