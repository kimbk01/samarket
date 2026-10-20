/**
 * R7 — 추천 관리 목록 고정 상한 없음.
 * 리포트: 보관된 번들(admin_settings JSON) 전체를 화면에서 쪽 나눔 (예전: 최신 30건만).
 * 실행 이력·알림·이슈: R7 후속으로 DB 테이블 + 서버 페이지 RPC 로 이전 — 계약은
 * recommendation-records-api-contract.test.ts (예전 메모리 보관 상한 200/300 자체가 제거됨).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDefaultRecommendationAnalyticsBundle,
  getRecommendationReports,
  importRecommendationAnalyticsBundle,
} from "@/lib/recommendation-analytics/recommendation-analytics-state";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function iso(i: number): string {
  // 동률 시각 포함 (2건씩 같은 시각)
  return new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + Math.floor(i / 2) * 60_000).toISOString();
}

describe("추천 관리 목록 — 고정 상한 없음 (R7)", () => {
  it("리포트: limit null → 전체, 기본 호출은 기존 50 유지", () => {
    const base = createDefaultRecommendationAnalyticsBundle();
    const tmpl = base.reports[0];
    expect(tmpl).toBeTruthy();
    const reports = Array.from({ length: 75 }, (_, i) => ({
      ...tmpl!,
      id: `rep-${i}`,
      reportType: "daily" as const,
      generatedAt: iso(i),
    }));
    importRecommendationAnalyticsBundle({ ...base, reports });
    expect(getRecommendationReports({ limit: null })).toHaveLength(75);
    expect(getRecommendationReports({ reportType: "daily", limit: null })).toHaveLength(75);
    expect(getRecommendationReports()).toHaveLength(50);
  });

  it("화면 표: 리포트는 고정 limit 없이 전체를 받아 AdminPagination 으로 쪽 나눔", () => {
    for (const rel of ["components/admin/recommendation-reports/RecommendationReportTable.tsx"]) {
      const src = read(rel);
      expect(src, rel).toContain("limit: null");
      expect(src, rel).not.toMatch(/limit:\s*\d+/);
      expect(src, rel).toContain("<AdminPagination");
      expect(src, rel).toContain("total={total}");
    }
  });

  it("요약 집계: 실행 이력·이슈·미확인 알림을 고정 상한 없이 센다 (DB 요약 RPC)", () => {
    for (const rel of [
      "lib/recommendation-automation/recommendation-automation-summary.ts",
      "lib/recommendation-reports/recommendation-report-utils.ts",
      "lib/recommendation-analytics/recommendation-monitoring-summary.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/limit:\s*\d+/);
      expect(src, rel).toContain("getRecommendationRecordsSummary()");
    }
  });
});
