/**
 * 45단계: 운영 벤치마크 mock (44단계 성숙도/KPI 기반 currentScore placeholder)
 */

import { getLatestOpsMaturityScore } from "@/lib/ops-maturity/mock-ops-maturity-scores";
import type {
  OpsBenchmark,
  OpsBenchmarkScope,
  OpsBenchmarkDomain,
  OpsBenchmarkTrend,
} from "@/lib/types/ops-benchmarks";

type MaturityScoreKey =
  | "recommendationQualityScore"
  | "responseScore"
  | "automationScore"
  | "documentationScore"
  | "monitoringScore"
  | "learningScore";

const DOMAIN_TO_MATURITY_KEY: Record<OpsBenchmarkDomain, MaturityScoreKey> = {
  recommendation_quality: "recommendationQualityScore",
  incident_response: "responseScore",
  automation: "automationScore",
  documentation: "documentationScore",
  execution: "monitoringScore",
  learning: "learningScore",
};

function buildBenchmarksFromMaturity(
  benchmarkDate: string,
  scope: OpsBenchmarkScope
): OpsBenchmark[] {
  const latest = getLatestOpsMaturityScore(scope === "quarterly" ? "weekly" : "monthly");
  const domains: OpsBenchmarkDomain[] = [
    "recommendation_quality",
    "incident_response",
    "automation",
    "documentation",
    "execution",
    "learning",
  ];
  const now = new Date().toISOString();
  return domains.map((domain, i) => {
    const key = DOMAIN_TO_MATURITY_KEY[domain];
    const currentScore = latest ? (latest[key] as number) + (i % 3 === 0 ? 2 : 0) : 70;
    const targetScore = Math.min(100, currentScore + 5 + (i % 2) * 5);
    const referenceScore = 75;
    const gapScore = targetScore - currentScore;
    const trend: OpsBenchmarkTrend =
      gapScore <= 0 ? "improving" : currentScore >= referenceScore ? "stable" : "declining";
    return {
      id: `ob-${scope}-${domain}-${benchmarkDate}`,
      benchmarkDate,
      scope,
      domain,
      currentScore,
      targetScore,
      referenceScore,
      gapScore,
      trend,
      createdAt: now,
      updatedAt: now,
      note: "",
    };
  });
}

const CACHE: OpsBenchmark[] = (() => {
  const today = new Date().toISOString().slice(0, 10);
  const q1 = `${new Date().getFullYear()}-01-01`;
  const q2 = `${new Date().getFullYear()}-04-01`;
  const q3 = `${new Date().getFullYear()}-07-01`;
  const q4 = `${new Date().getFullYear()}-10-01`;
  return [
    ...buildBenchmarksFromMaturity(today, "quarterly"),
    ...buildBenchmarksFromMaturity(q1, "yearly"),
    ...buildBenchmarksFromMaturity(q2, "yearly"),
    ...buildBenchmarksFromMaturity(q3, "yearly"),
    ...buildBenchmarksFromMaturity(q4, "yearly"),
  ];
})();

export function getOpsBenchmarks(filters?: {
  scope?: OpsBenchmarkScope;
  benchmarkDate?: string;
  domain?: OpsBenchmarkDomain;
}): OpsBenchmark[] {
  let list = [...CACHE];
  if (filters?.scope) list = list.filter((b) => b.scope === filters.scope);
  if (filters?.benchmarkDate) list = list.filter((b) => b.benchmarkDate === filters.benchmarkDate);
  if (filters?.domain) list = list.filter((b) => b.domain === filters.domain);
  return list.sort(
    (a, b) =>
      new Date(b.benchmarkDate).getTime() - new Date(a.benchmarkDate).getTime()
  );
}

export function getLatestOpsBenchmarks(
  scope: OpsBenchmarkScope
): OpsBenchmark[] {
  const list = getOpsBenchmarks({ scope });
  if (list.length === 0) return [];
  const latestDate = list[0].benchmarkDate;
  return list.filter((b) => b.benchmarkDate === latestDate);
}

export function getOpsBenchmarkByDomain(
  scope: OpsBenchmarkScope,
  domain: OpsBenchmarkDomain,
  benchmarkDate?: string
): OpsBenchmark | undefined {
  const list = getOpsBenchmarks({ scope, domain });
  if (list.length === 0) return undefined;
  if (benchmarkDate) return list.find((b) => b.benchmarkDate === benchmarkDate);
  return list[0];
}
