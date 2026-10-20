/**
 * R7 후속 — 추천 기록(이슈·알림 이벤트·자동화 실행·노출) DB 테이블 보관 계약 (가짜 DB).
 * - 목록 API: limit/offset → 목록 RPC 인자(1..100) · 응답 total = RPC total (상한 없음) · 테이블 전량 조회 없음.
 * - 쓰기: 건별 INSERT/조건부 UPDATE (묶음 전체 PUT 없음) · 감사 기록 · 실행자 = 로그인 관리자.
 * - 권한: 관리자 가드 실패 → 그 응답 그대로, DB 호출 없음.
 * - 요약: 요약 RPC 1회 (오늘 = 마닐라 0시 · 실험 그룹 = DB 실험 번들 배정) → 요약 카드·보고서·평가·실험 성과.
 * - 메모리 링버퍼(MAX_*)·묶음 하이드레이트·예시 기록 채우기 제거.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; op: string; args: unknown[] };

const h = vi.hoisted(() => ({
  sb: null as unknown,
  adminOk: true,
  audit: [] as unknown[],
}));

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";

function fakeSb(opts: {
  rpc?: Record<string, unknown>;
  single?: Record<string, Record<string, unknown> | null>;
}) {
  const calls: Call[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    const chain =
      (op: string) =>
      (...args: unknown[]) => {
        calls.push({ table, op, args });
        return builder;
      };
    for (const op of ["select", "insert", "update", "upsert", "eq", "in", "order", "range", "limit"]) {
      builder[op] = chain(op);
    }
    const one = () => {
      calls.push({ table, op: "single", args: [] });
      const row = opts.single?.[table] ?? null;
      return Promise.resolve({ data: row, error: null });
    };
    builder.maybeSingle = one;
    builder.single = one;
    return builder;
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return { data: opts.rpc?.[fn] ?? null, error: null };
  };
  return { sb: { from, rpc }, calls, rpcCalls };
}

vi.mock("@/lib/admin/require-admin-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAdminApiUser: async () =>
    h.adminOk
      ? { ok: true, userId: "11111111-1111-1111-1111-111111111111" }
      : { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) },
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => h.sb }));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: vi.fn(async (_sb: unknown, _req: unknown, input: unknown) => {
    h.audit.push(input);
  }),
}));

import { GET as incidentsGET } from "@/app/api/admin/recommendation-records/incidents/route";
import { PATCH as incidentPATCH } from "@/app/api/admin/recommendation-records/incidents/[id]/route";
import { GET as alertsGET } from "@/app/api/admin/recommendation-records/alert-events/route";
import { PATCH as alertPATCH } from "@/app/api/admin/recommendation-records/alert-events/[id]/route";
import {
  GET as executionsGET,
  POST as executionsPOST,
} from "@/app/api/admin/recommendation-records/automation-executions/route";
import { GET as summaryGET } from "@/app/api/admin/recommendation-records/summary/route";
import { manilaTodayStartUtcIso } from "@/lib/admin/metrics/manila-period";
import {
  emptyRecommendationRecordsSummary,
  parseRecommendationRecordsSummary,
  type RecommendationRecordsSummary,
} from "@/lib/recommendation-ops/recommendation-records-contract";
import { setRecommendationRecordsSummary } from "@/lib/recommendation-ops/recommendation-records-summary-state";
import { getRecommendationMonitoringSummary } from "@/lib/recommendation-analytics/recommendation-monitoring-summary";
import { getRecommendationAutomationSummary } from "@/lib/recommendation-automation/recommendation-automation-summary";
import { getRecommendationAnalyticsSummary } from "@/lib/recommendation/recommendation-analytics-summary";
import { generateRecommendationReport } from "@/lib/recommendation-reports/recommendation-report-utils";
import { getRecommendationReportKpis } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import { parseRecommendationAnalyticsBundle } from "@/lib/recommendation-analytics/recommendation-analytics-db";
import { getExperimentMetrics } from "@/lib/recommendation-experiments/recommendation-experiment-metrics";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    ...(init?.body !== undefined
      ? { body: JSON.stringify(init.body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  h.adminOk = true;
  h.audit = [];
  setRecommendationRecordsSummary(emptyRecommendationRecordsSummary());
});

describe("목록 API — 서버 페이지 RPC (limit/offset·total, 고정 상한 없음)", () => {
  it("이슈: limit/offset/필터 → RPC 인자, total = RPC 전체 건수", async () => {
    const f = fakeSb({ rpc: { admin_recommendation_incidents_page: { total: 1234, rows: [{ id: "inc-1" }] } } });
    h.sb = f.sb;
    const res = await incidentsGET(req("/api/admin/recommendation-records/incidents?limit=50&offset=100&status=open&surface=home"));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(f.rpcCalls).toEqual([
      {
        fn: "admin_recommendation_incidents_page",
        args: { p_status: "open", p_surface: "home", p_limit: 50, p_offset: 100 },
      },
    ]);
    expect(j).toMatchObject({ ok: true, total: 1234, rows: [{ id: "inc-1" }], limit: 50, offset: 100 });
    expect(f.calls).toEqual([]);
  });

  it("이슈: 한 페이지 최대 100 · 잘못된 필터는 전체(null) · 기본 20", async () => {
    const f = fakeSb({ rpc: { admin_recommendation_incidents_page: { total: 0, rows: [] } } });
    h.sb = f.sb;
    await incidentsGET(req("/api/admin/recommendation-records/incidents?limit=500&status=bogus&surface=x"));
    await incidentsGET(req("/api/admin/recommendation-records/incidents"));
    expect(f.rpcCalls[0].args).toEqual({ p_status: null, p_surface: null, p_limit: 100, p_offset: 0 });
    expect(f.rpcCalls[1].args).toEqual({ p_status: null, p_surface: null, p_limit: 20, p_offset: 0 });
  });

  it("알림 이벤트: status=ack|unack → p_acknowledged true|false, 없으면 null", async () => {
    const f = fakeSb({ rpc: { admin_recommendation_alert_events_page: { total: 777, rows: [] } } });
    h.sb = f.sb;
    const r1 = await alertsGET(req("/api/admin/recommendation-records/alert-events?status=unack&limit=100&offset=600"));
    await alertsGET(req("/api/admin/recommendation-records/alert-events?status=ack"));
    await alertsGET(req("/api/admin/recommendation-records/alert-events"));
    expect((await r1.json()).total).toBe(777);
    expect(f.rpcCalls.map((c) => c.args)).toEqual([
      { p_acknowledged: false, p_surface: null, p_limit: 100, p_offset: 600 },
      { p_acknowledged: true, p_surface: null, p_limit: 20, p_offset: 0 },
      { p_acknowledged: null, p_surface: null, p_limit: 20, p_offset: 0 },
    ]);
  });

  it("실행 이력: surface·actionType → RPC 인자, total 그대로", async () => {
    const f = fakeSb({ rpc: { admin_recommendation_automation_executions_page: { total: 5000, rows: [] } } });
    h.sb = f.sb;
    const res = await executionsGET(
      req("/api/admin/recommendation-records/automation-executions?surface=shop&actionType=auto_rollback&limit=20&offset=4980")
    );
    expect((await res.json()).total).toBe(5000);
    expect(f.rpcCalls[0]).toEqual({
      fn: "admin_recommendation_automation_executions_page",
      args: { p_surface: "shop", p_action_type: "auto_rollback", p_limit: 20, p_offset: 4980 },
    });
  });

  it("RPC 모양이 틀리면 500 (빈 목록으로 덮지 않음)", async () => {
    const f = fakeSb({ rpc: { admin_recommendation_incidents_page: { rows: "x" } } });
    h.sb = f.sb;
    const res = await incidentsGET(req("/api/admin/recommendation-records/incidents"));
    expect(res.status).toBe(500);
  });
});

describe("건별 쓰기 — INSERT/조건부 UPDATE + 감사", () => {
  it("실행 기록 POST: 테이블 1건 INSERT · 실행자 = 로그인 관리자 · 감사", async () => {
    const row = {
      id: "rex-1",
      surface: "home",
      incident_id: null,
      action_type: "auto_fallback",
      execution_mode: "dry_run",
      status: "skipped",
      reason: "r",
      before_state: "normal",
      after_state: "fallback",
      created_at: "2026-10-20T00:00:00Z",
      completed_at: "2026-10-20T00:00:00Z",
    };
    const f = fakeSb({ single: { recommendation_automation_executions: row } });
    h.sb = f.sb;
    const res = await executionsPOST(
      req("/api/admin/recommendation-records/automation-executions", {
        method: "POST",
        body: {
          execution: {
            surface: "home",
            incidentId: null,
            actionType: "auto_fallback",
            executionMode: "dry_run",
            status: "skipped",
            reason: "r",
            beforeState: "normal",
            afterState: "fallback",
          },
        },
      })
    );
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.execution).toMatchObject({ id: "rex-1", actionType: "auto_fallback", afterState: "fallback" });
    const insert = f.calls.find((c) => c.op === "insert");
    expect(insert?.table).toBe("recommendation_automation_executions");
    expect(insert?.args[0]).toMatchObject({
      surface: "home",
      action_type: "auto_fallback",
      execution_mode: "dry_run",
      status: "skipped",
      created_by_admin_id: ADMIN_ID,
    });
    expect(f.calls.some((c) => c.op === "upsert" || c.table === "admin_settings")).toBe(false);
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({ action: "recommendation_automation_execution.create", actorId: ADMIN_ID });
  });

  it("실행 기록 POST: 허용 밖 값 → 400, INSERT 없음", async () => {
    const f = fakeSb({});
    h.sb = f.sb;
    const res = await executionsPOST(
      req("/api/admin/recommendation-records/automation-executions", {
        method: "POST",
        body: { execution: { surface: "moon", actionType: "auto_fallback", executionMode: "dry_run", status: "skipped" } },
      })
    );
    expect(res.status).toBe(400);
    expect(f.calls).toEqual([]);
    expect(h.audit).toHaveLength(0);
  });

  it("이슈 확인: open 만 UPDATE · 확인자 id/닉네임 = 로그인 관리자", async () => {
    const f = fakeSb({
      single: { profiles: { nickname: "운영자A" }, recommendation_incidents: { id: "inc-1", status: "acknowledged" } },
    });
    h.sb = f.sb;
    const res = await incidentPATCH(
      req("/api/admin/recommendation-records/incidents/inc-1", { method: "PATCH", body: { action: "acknowledge" } }),
      params("inc-1")
    );
    expect(res.status).toBe(200);
    const ops = f.calls.filter((c) => c.table === "recommendation_incidents");
    const update = ops.find((c) => c.op === "update");
    expect(update?.args[0]).toMatchObject({
      status: "acknowledged",
      acknowledged_by_admin_id: ADMIN_ID,
      acknowledged_by_admin_nickname: "운영자A",
    });
    expect(ops.find((c) => c.op === "eq")?.args).toEqual(["id", "inc-1"]);
    expect(ops.find((c) => c.op === "in")?.args).toEqual(["status", ["open"]]);
    expect(h.audit[0]).toMatchObject({ action: "recommendation_incident.acknowledge", targetId: "inc-1" });
  });

  it("이슈 해결: open/acknowledged 만 UPDATE · 대상 없음(이미 해결) → 409", async () => {
    const f = fakeSb({ single: { recommendation_incidents: null } });
    h.sb = f.sb;
    const res = await incidentPATCH(
      req("/api/admin/recommendation-records/incidents/inc-9", { method: "PATCH", body: { action: "resolve" } }),
      params("inc-9")
    );
    expect(res.status).toBe(409);
    const ops = f.calls.filter((c) => c.table === "recommendation_incidents");
    expect(ops.find((c) => c.op === "update")?.args[0]).toMatchObject({ status: "resolved" });
    expect(ops.find((c) => c.op === "in")?.args).toEqual(["status", ["open", "acknowledged"]]);
    expect(h.audit).toHaveLength(0);
  });

  it("이슈: 알 수 없는 action → 400", async () => {
    const f = fakeSb({});
    h.sb = f.sb;
    const res = await incidentPATCH(
      req("/api/admin/recommendation-records/incidents/inc-1", { method: "PATCH", body: { action: "delete" } }),
      params("inc-1")
    );
    expect(res.status).toBe(400);
    expect(f.calls).toEqual([]);
  });

  it("알림 확인: 미확인 1건만 UPDATE", async () => {
    const f = fakeSb({ single: { recommendation_alert_events: { id: "ae-1" } } });
    h.sb = f.sb;
    const res = await alertPATCH(
      req("/api/admin/recommendation-records/alert-events/ae-1", { method: "PATCH", body: { action: "acknowledge" } }),
      params("ae-1")
    );
    expect(res.status).toBe(200);
    const eqs = f.calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toEqual([
      ["id", "ae-1"],
      ["is_acknowledged", false],
    ]);
    expect(f.calls.find((c) => c.op === "update")?.args[0]).toMatchObject({
      is_acknowledged: true,
      acknowledged_by_admin_id: ADMIN_ID,
    });
  });
});

describe("권한 — 관리자 가드 실패 시 DB 호출 없음", () => {
  it("모든 라우트가 가드 응답(403)을 그대로 돌려준다", async () => {
    h.adminOk = false;
    const f = fakeSb({});
    h.sb = f.sb;
    const results = await Promise.all([
      incidentsGET(req("/api/admin/recommendation-records/incidents")),
      alertsGET(req("/api/admin/recommendation-records/alert-events")),
      executionsGET(req("/api/admin/recommendation-records/automation-executions")),
      summaryGET(),
      executionsPOST(req("/api/admin/recommendation-records/automation-executions", { method: "POST", body: {} })),
      incidentPATCH(req("/x", { method: "PATCH", body: { action: "resolve" } }), params("inc-1")),
      alertPATCH(req("/x", { method: "PATCH", body: { action: "acknowledge" } }), params("ae-1")),
    ]);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
    expect(f.calls).toEqual([]);
    expect(f.rpcCalls).toEqual([]);
  });
});

function summaryFixture(): RecommendationRecordsSummary {
  const s = emptyRecommendationRecordsSummary();
  s.incidents.total = 4321;
  s.incidents.open = 2500;
  s.incidents.bySurface.home = { criticalOpen: 3, deploymentFailureUnresolved: 7 };
  s.alertEvents = { total: 9000, unacknowledged: 6000 };
  s.executions.total = 12000;
  s.executions.latestCreatedAt = "2026-10-20T03:00:00+00:00";
  s.executions.since = { total: 410, success: 400, failed: 4, skipped: 6 };
  s.executions.byActionType.auto_fallback = 1000;
  s.executions.byActionType.auto_kill_switch = 20;
  s.executions.byActionType.auto_rollback = 30;
  s.impressions = {
    total: 1500,
    sections: [
      { surface: "home", sectionKey: "recommended", impressionCount: 1000, clickCount: 100, conversionCount: 10, scoreSum: 5000, topReason: "추천" },
      { surface: "search", sectionKey: "local_latest", impressionCount: 500, clickCount: 25, conversionCount: 5, scoreSum: 1000, topReason: "-" },
    ],
  };
  s.userGroups = [
    { key: "exp-1|fv-control-home", impressionCount: 800, clickCount: 40, conversionCount: 8, scoreSum: 1600 },
  ];
  return s;
}

describe("요약 — 요약 RPC 1회, 화면 집계는 상한 없이 RPC 값", () => {
  it("summary API: 마닐라 오늘 0시 · DB 실험 번들의 배정 회원으로 그룹", async () => {
    const f = fakeSb({ rpc: { admin_recommendation_records_summary: summaryFixture() } });
    h.sb = f.sb;
    const res = await summaryGET();
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(f.rpcCalls).toHaveLength(1);
    const call = f.rpcCalls[0];
    expect(call.fn).toBe("admin_recommendation_records_summary");
    expect(String(call.args.p_since).slice(0, 13)).toBe(manilaTodayStartUtcIso().slice(0, 13));
    const groups = call.args.p_user_groups as { key: string; surface: string; userIds: string[] }[];
    expect(groups.find((g) => g.key === "exp-1|fv-control-home")).toMatchObject({ surface: "home", userIds: ["user2"] });
    expect(groups.find((g) => g.key === "exp-1|fv-variant-a-home")?.userIds).toEqual(["me"]);
    expect(parseRecommendationRecordsSummary(j.summary)).toEqual(summaryFixture());
    // 실험 번들은 admin_settings 1행 읽기뿐 — 기록 테이블 전량 조회 없음
    expect(f.calls.filter((c) => c.table !== "admin_settings")).toEqual([]);
  });

  it("모니터링 요약 카드: 열린 이슈·미확인 알림 = 전체 건수 (예전 200 상한 없음)", () => {
    setRecommendationRecordsSummary(summaryFixture());
    const m = getRecommendationMonitoringSummary();
    expect(m.openIncidentCount).toBe(2500);
    expect(m.activeAlertCount).toBe(6000);
  });

  it("자동화 요약 카드: 오늘 실행·결과별·최근 실행 = RPC 값", () => {
    setRecommendationRecordsSummary(summaryFixture());
    const a = getRecommendationAutomationSummary();
    expect(a).toMatchObject({
      executionsToday: 410,
      successCount: 400,
      failedCount: 4,
      skippedCount: 6,
      latestExecutionAt: "2026-10-20T03:00:00+00:00",
    });
  });

  it("분석 성과 요약: 섹션별 노출·CTR·평균 점수 (집계는 DB)", () => {
    setRecommendationRecordsSummary(summaryFixture());
    const list = getRecommendationAnalyticsSummary();
    expect(list.map((x) => `${x.surface}:${x.sectionKey}`)).toEqual(["home:recommended", "search:local_latest"]);
    expect(list[0]).toMatchObject({ impressionCount: 1000, clickCount: 100, ctr: 0.1, conversionRate: 0.1, avgScore: 5, topReason: "추천" });
  });

  it("보고서 KPI: 실행·이슈 수 = 전체 건수, 노출 0건이면 0 (예시 숫자 100000 등 금지)", () => {
    setRecommendationRecordsSummary(summaryFixture());
    const id1 = generateRecommendationReport("today", "all", "daily", "admin");
    expect(getRecommendationReportKpis(id1)).toMatchObject({
      impressionCount: 1500,
      clickCount: 125,
      fallbackCount: 1000,
      killSwitchCount: 20,
      rollbackCount: 30,
      incidentCount: 4321,
    });
    setRecommendationRecordsSummary(emptyRecommendationRecordsSummary());
    const id2 = generateRecommendationReport("today", "all", "daily", "admin");
    expect(getRecommendationReportKpis(id2)).toMatchObject({
      impressionCount: 0,
      clickCount: 0,
      ctr: 0,
      conversionCount: 0,
      conversionRate: 0,
      avgScore: 0,
      incidentCount: 0,
    });
  });

  it("실험 성과: 버전별 노출 집계 = 요약 RPC 그룹, 없으면 0", () => {
    setRecommendationRecordsSummary(summaryFixture());
    const metrics = getExperimentMetrics("exp-1");
    const control = metrics.find((m) => m.versionId === "fv-control-home");
    const variant = metrics.find((m) => m.versionId === "fv-variant-a-home");
    expect(control).toMatchObject({ impressionCount: 800, clickCount: 40, conversionCount: 8, ctr: 0.05, avgScore: 2 });
    expect(variant).toMatchObject({ impressionCount: 0, clickCount: 0, conversionCount: 0 });
  });

  it("빈 DB(운영 현재) → 요약 0건 — 예시 기록으로 채우지 않음", () => {
    const m = getRecommendationMonitoringSummary();
    expect(m.openIncidentCount).toBe(0);
    expect(m.activeAlertCount).toBe(0);
    expect(getRecommendationAnalyticsSummary()).toEqual([]);
    expect(getRecommendationAutomationSummary().latestExecutionAt).toBeNull();
  });
});

describe("분석 번들 — 노출 기록은 묶음에서 제외", () => {
  it("예전 형식(impressions 포함)을 읽어도 impressions 는 버린다", () => {
    const b = parseRecommendationAnalyticsBundle({ version: 1, impressions: [{ id: "x" }], reports: [] });
    expect(b).not.toBeNull();
    expect(b && "impressions" in b).toBe(false);
  });
});

describe("소스 계약 — 링버퍼·묶음 하이드레이트·예시 기록 제거", () => {
  it("런타임 묶음 저장소·API 퇴역", () => {
    for (const rel of [
      "lib/recommendation-ops/recommendation-runtime-state.ts",
      "lib/recommendation-ops/recommendation-runtime-db.ts",
      "lib/recommendation-ops/recommendation-runtime-sync-client.ts",
      "app/api/admin/recommendation-runtime/route.ts",
    ]) {
      expect(existsSync(path.join(ROOT, rel)), rel).toBe(false);
    }
  });

  it("고정 보관 상한 MAX_* 없음 · 노출 예시 기록 없음", () => {
    const analytics = read("lib/recommendation-analytics/recommendation-analytics-state.ts");
    expect(analytics).not.toMatch(/MAX_IMPRESSIONS\s*=/);
    expect(analytics).not.toMatch(/defaultImpressions|IMPRESSIONS\s*:/);
    for (const rel of [
      "lib/recommendation-ops/recommendation-records-db.ts",
      "lib/recommendation-ops/recommendation-records-summary-state.ts",
      "lib/recommendation-ops/recommendation-records-client.ts",
    ]) {
      expect(read(rel), rel).not.toMatch(/MAX_(INCIDENTS|ALERT_EVENTS|EXECUTIONS|IMPRESSIONS)/);
    }
  });

  it("관리자 표: 서버 페이지(offset·total) + AdminPagination", () => {
    for (const rel of [
      "components/admin/recommendation-monitoring/IncidentTable.tsx",
      "components/admin/recommendation-monitoring/AlertEventTable.tsx",
      "components/admin/recommendation-automation/AutomationExecutionTable.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).toMatch(/fetchRecommendation\w+Page\(/);
      expect(src, rel).toContain("offset: adminListOffsetForPage(");
      expect(src, rel).toContain("<AdminPagination");
      expect(src, rel).toContain("total={total}");
      expect(src, rel).not.toMatch(/limit:\s*null/);
      expect(src, rel).not.toContain("commitRecommendationRuntimeChange");
    }
  });
});
