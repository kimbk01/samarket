/**
 * 53단계: 릴리즈 아카이브 요약 mock
 */

import type { ReleaseArchiveSummary } from "@/lib/types/release-archive";
import { getReleaseArchives } from "./mock-release-archives";
import { getReleaseRegressionIssues } from "./mock-release-regression-issues";

export function getReleaseArchiveSummary(): ReleaseArchiveSummary {
  const archives = getReleaseArchives();
  const issues = getReleaseRegressionIssues();

  const activeReleases = archives.filter((a) => a.releaseStatus === "active").length;
  const stableReleases = archives.filter((a) => a.releaseStatus === "stable").length;
  const rolledBackReleases = archives.filter((a) => a.releaseStatus === "rolled_back").length;
  const openRegressionIssues = issues.filter(
    (i) => !["fixed", "verified", "archived"].includes(i.status)
  ).length;
  const criticalRegressionIssues = issues.filter((i) => i.severity === "critical").length;

  const latestRelease = archives.sort(
    (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
  )[0];

  const avgRegression =
    archives.length > 0 ? issues.length / archives.length : 0;

  return {
    totalReleases: archives.length,
    activeReleases,
    stableReleases,
    rolledBackReleases,
    totalRegressionIssues: issues.length,
    openRegressionIssues,
    criticalRegressionIssues,
    averageRegressionPerRelease: Math.round(avgRegression * 10) / 10,
    latestReleaseAt: latestRelease?.releaseDate ?? new Date().toISOString().slice(0, 10),
  };
}
