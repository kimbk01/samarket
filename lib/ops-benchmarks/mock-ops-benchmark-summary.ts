/**
 * 45단계: 벤치마크 요약 mock
 */

import { getOpsBenchmarks } from "./mock-ops-benchmarks";
import type { OpsBenchmarkSummary } from "@/lib/types/ops-benchmarks";

export function getOpsBenchmarkSummary(
  scope: "quarterly" | "yearly" = "quarterly"
): OpsBenchmarkSummary {
  const list = getOpsBenchmarks({ scope });
  const latestDate =
    list.length > 0
      ? list.reduce(
          (max, b) => (b.benchmarkDate > max ? b.benchmarkDate : max),
          list[0].benchmarkDate
        )
      : null;
  const byDate = latestDate ? list.filter((b) => b.benchmarkDate === latestDate) : [];
  const currentScores = byDate.map((b) => b.currentScore);
  const targetScores = byDate.map((b) => b.targetScore);
  const averageCurrentScore =
    currentScores.length > 0
      ? Math.round(
          currentScores.reduce((a, b) => a + b, 0) / currentScores.length
        )
      : 0;
  const averageTargetScore =
    targetScores.length > 0
      ? Math.round(
          targetScores.reduce((a, b) => a + b, 0) / targetScores.length
        )
      : 0;
  const highGapDomainCount = byDate.filter((b) => b.gapScore > 5).length;
  const improvingDomainCount = byDate.filter((b) => b.trend === "improving").length;
  const decliningDomainCount = byDate.filter((b) => b.trend === "declining").length;

  return {
    averageCurrentScore,
    averageTargetScore,
    highGapDomainCount,
    improvingDomainCount,
    decliningDomainCount,
    latestBenchmarkDate: latestDate,
  };
}
