/**
 * R7 — 추천 관리 목록: 보관된 번들(admin_settings JSON) 전체를 화면에서 쪽 나눔한다.
 * 예전: 실행 이력·알림 최신 50건, 리포트 최신 30건만 보이고 나머지는 잘림. 미확인 알림 수(요약 카드)도 50 에서 멈춤.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RecommendationAlertEvent } from "@/lib/types/recommendation-monitoring";
import type { RecommendationAutomationExecution } from "@/lib/types/recommendation-automation";
import {
  createDefaultRecommendationRuntimeBundle,
  getRecommendationAlertEvents,
  getRecommendationAutomationExecutions,
  importRecommendationRuntimeBundle,
} from "@/lib/recommendation-ops/recommendation-runtime-state";
import {
  createDefaultRecommendationAnalyticsBundle,
  getRecommendationReports,
  importRecommendationAnalyticsBundle,
} from "@/lib/recommendation-analytics/recommendation-analytics-state";
import { getRecommendationMonitoringSummary } from "@/lib/recommendation-analytics/recommendation-monitoring-summary";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function iso(i: number): string {
  // 동률 시각 포함 (2건씩 같은 시각)
  return new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + Math.floor(i / 2) * 60_000).toISOString();
}

function alerts(n: number): RecommendationAlertEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ae-${i}`,
    ruleId: "r1",
    surface: "home",
    severity: "warning",
    metricKey: "ctr",
    currentValue: 1,
    thresholdValue: 2,
    message: `m${i}`,
    isAcknowledged: i % 3 === 0,
    acknowledgedAt: null,
    acknowledgedByAdminId: null,
    createdAt: iso(i),
  })) as RecommendationAlertEvent[];
}

function executions(n: number): RecommendationAutomationExecution[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ex-${i}`,
    surface: i % 2 === 0 ? "home" : "search",
    incidentId: null,
    actionType: "auto_fallback",
    executionMode: "dry_run",
    status: "success",
    reason: "r",
    beforeState: "a",
    afterState: "b",
    createdAt: iso(i),
    completedAt: null,
  })) as RecommendationAutomationExecution[];
}

describe("추천 관리 목록 — 고정 상한 없음 (R7)", () => {
  it("알림: limit null → 보관된 전체(200), 필터 후 total 정확, 기본 호출은 기존 50 유지", () => {
    importRecommendationRuntimeBundle({
      ...createDefaultRecommendationRuntimeBundle(),
      alertEvents: alerts(200),
    });
    const all = getRecommendationAlertEvents({ limit: null });
    expect(all).toHaveLength(200);
    expect(new Set(all.map((e) => e.id)).size).toBe(200);
    const unack = getRecommendationAlertEvents({ isAcknowledged: false, limit: null });
    expect(unack).toHaveLength(200 - Math.ceil(200 / 3));
    expect(getRecommendationAlertEvents()).toHaveLength(50);
    expect(getRecommendationMonitoringSummary().activeAlertCount).toBe(unack.length);
  });

  it("실행 이력: limit null → 보관된 전체(300), surface 필터 적용, 기본 호출은 기존 100 유지", () => {
    importRecommendationRuntimeBundle({
      ...createDefaultRecommendationRuntimeBundle(),
      automationExecutions: executions(300),
    });
    expect(getRecommendationAutomationExecutions({ limit: null })).toHaveLength(300);
    expect(getRecommendationAutomationExecutions({ surface: "home", limit: null })).toHaveLength(150);
    expect(getRecommendationAutomationExecutions()).toHaveLength(100);
  });

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

  it("화면 표: 고정 limit 없이 전체를 받아 AdminPagination 으로 쪽 나눔", () => {
    for (const rel of [
      "components/admin/recommendation-automation/AutomationExecutionTable.tsx",
      "components/admin/recommendation-monitoring/AlertEventTable.tsx",
      "components/admin/recommendation-reports/RecommendationReportTable.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).toContain("limit: null");
      expect(src, rel).not.toMatch(/limit:\s*\d+/);
      expect(src, rel).toContain("<AdminPagination");
      expect(src, rel).toContain("total={total}");
    }
  });

  it("요약 집계: 실행 이력·미확인 알림을 고정 상한 없이 센다", () => {
    for (const rel of [
      "lib/recommendation-automation/recommendation-automation-summary.ts",
      "lib/recommendation-reports/recommendation-report-utils.ts",
      "lib/recommendation-analytics/recommendation-monitoring-summary.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/limit:\s*\d+/);
      expect(src, rel).toContain("limit: null");
    }
  });
});
