import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRecommendationReportById,
  getRecommendationReports,
} from "@/lib/recommendation-analytics/recommendation-analytics-state";

/** R7 실측 — 추천 보고서 상세에 예시 보고서(rr-1·rr-2)와 고정 KPI(노출 125,000 등)가 실제처럼 보이던 결함 */
describe("추천 보고서 — 예시 보고서·고정 KPI 없음", () => {
  const src = readFileSync(
    resolve(process.cwd(), "lib/recommendation-analytics/recommendation-analytics-state.ts"),
    "utf8"
  );

  it("보고서·KPI 초기값은 비어 있고, 묶음을 불러올 때도 예시로 채우지 않는다", () => {
    expect(src).toContain("const REPORTS: RecommendationReport[] = [];");
    expect(src).toContain("const REPORT_KPIS: RecommendationReportKpis[] = [];");
    expect(src).not.toMatch(/defaultReports|defaultReportKpis/);
    expect(src).not.toMatch(/"rr-1"|"rr-2"/);
    expect(src).not.toMatch(/125000|890000/);
  });

  it("빈 상태에서 보고서 목록 0건 · 예시 id 조회 없음", () => {
    expect(getRecommendationReports()).toEqual([]);
    expect(getRecommendationReportById("rr-1")).toBeUndefined();
  });
});
