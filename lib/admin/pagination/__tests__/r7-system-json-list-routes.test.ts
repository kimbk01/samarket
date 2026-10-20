/**
 * R7 목록 표준 — system 워크스페이스 `admin_settings` JSON 번들 안 누적 기록의 서버 페이지 계약.
 * 가짜 DB(번들 로더 mock)로: `?part=` 요청은 `limit`(20/50/100)·`offset` 로 한 쪽만, `total` = 필터 후 전체 건수,
 * 화면 고정 상한(80·30·15·30·100·30·20 건) 없음. 파라미터가 없으면 기존 번들 응답 그대로(다른 호출자 호환).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireSuperAdmin = vi.fn();
const requireAdminApiUser = vi.fn();
const loadFeed = vi.fn();
const loadKnowledge = vi.fn();
const loadAutomation = vi.fn();
const loadLearning = vi.fn();
const loadRoutines = vi.fn();
const loadRunbooks = vi.fn();
const loadPerf = vi.fn();
const loadAppSettings = vi.fn();
const listPromotionHistory = vi.fn();
const listRecent = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a),
  requireAdminPermission: (...a: unknown[]) => requireSuperAdmin(...a),
}));
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: (...a: unknown[]) => requireAdminApiUser(...a),
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));
vi.mock("@/lib/feed-emergency/feed-emergency-db", async (orig) => ({
  ...(await orig<object>()),
  loadFeedEmergencyBundleFromDb: (...a: unknown[]) => loadFeed(...a),
}));
vi.mock("@/lib/ops-knowledge/ops-knowledge-db", async (orig) => ({
  ...(await orig<object>()),
  loadOpsKnowledgeBundleFromDb: (...a: unknown[]) => loadKnowledge(...a),
}));
vi.mock("@/lib/automation/automation-db", async (orig) => ({
  ...(await orig<object>()),
  loadAutomationBundleFromDb: (...a: unknown[]) => loadAutomation(...a),
}));
vi.mock("@/lib/ops-learning/ops-learning-db", async (orig) => ({
  ...(await orig<object>()),
  loadOpsLearningBundleFromDb: (...a: unknown[]) => loadLearning(...a),
}));
vi.mock("@/lib/ops-routines/ops-routines-db", async (orig) => ({
  ...(await orig<object>()),
  loadOpsRoutinesBundleFromDb: (...a: unknown[]) => loadRoutines(...a),
}));
vi.mock("@/lib/ops-runbooks/ops-runbooks-db", async (orig) => ({
  ...(await orig<object>()),
  loadOpsRunbooksBundleFromDb: (...a: unknown[]) => loadRunbooks(...a),
}));
vi.mock("@/lib/performance/performance-ops-db", async (orig) => ({
  ...(await orig<object>()),
  loadPerformanceOpsBundleFromDb: (...a: unknown[]) => loadPerf(...a),
}));
vi.mock("@/lib/admin-settings/app-settings-db", async (orig) => ({
  ...(await orig<object>()),
  loadAppSettingsBundleFromDb: (...a: unknown[]) => loadAppSettings(...a),
}));
vi.mock("@/lib/admin/deploy-promotion/deploy-promotion-store", async (orig) => ({
  ...(await orig<object>()),
  listPromotionHistory: (...a: unknown[]) => listPromotionHistory(...a),
  listRecentDeployPromotionRecords: (...a: unknown[]) => listRecent(...a),
  hydratePromotionRecordFromLedger: async () => ({ hydrated: false }),
}));
vi.mock("@/lib/admin/deploy-promotion/deploy-promotion-ssot", async (orig) => ({
  ...(await orig<object>()),
  readRuntimeGitSha: () => null,
}));

import { GET as feedGET } from "@/app/api/admin/feed-emergency/route";
import { GET as knowledgeGET } from "@/app/api/admin/ops-knowledge/route";
import { GET as automationGET } from "@/app/api/admin/automation/route";
import { GET as learningGET } from "@/app/api/admin/ops-learning/route";
import { GET as routinesGET } from "@/app/api/admin/ops-routines/route";
import { GET as runbooksGET } from "@/app/api/admin/ops-runbooks/route";
import { GET as perfGET } from "@/app/api/admin/performance-ops/route";
import { GET as appSettingsGET } from "@/app/api/admin/app-settings/route";
import { GET as deployStatusGET } from "@/app/api/admin/deploy/status/route";

type PageJson<T = Record<string, unknown>> = {
  ok: boolean;
  items?: T[];
  total?: number;
  limit?: number;
  offset?: number;
  bundle?: unknown;
  error?: string;
};

const req = (path: string) => new NextRequest(`https://x.test${path}`);
const iso = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
/** i 가 클수록 최신 — 저장 순서는 일부러 오래된 것부터. */
const rows = <T>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i));
const ok = (bundle: unknown) => ({ ok: true, bundle, source: "db" });

async function json<T = Record<string, unknown>>(res: Response): Promise<PageJson<T>> {
  return (await res.json()) as PageJson<T>;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ ok: true, sb: {}, actor: { userId: "admin-1" } });
  requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
});

describe("feed-emergency ?part=logs", () => {
  const logs = rows(130, (i) => ({
    id: `l${i}`,
    surface: i % 2 === 0 ? "home" : "search",
    actionType: "kill_switch_on",
    actorType: "admin",
    actorNickname: "운영",
    note: "",
    createdAt: iso(i),
  }));
  beforeEach(() => loadFeed.mockResolvedValue(ok({ version: 1, policies: [], fallbackStates: [], sectionOverrides: [], logs })));

  it("limit 50 · offset 50 → 51~100번째 최신, total 130 (화면 고정 80건 없음)", async () => {
    const j = await json<{ id: string }>(await feedGET(req("/api/admin/feed-emergency?part=logs&limit=50&offset=50")));
    expect(j.total).toBe(130);
    expect(j.items).toHaveLength(50);
    expect(j.items?.[0].id).toBe("l79");
    expect(j).toMatchObject({ limit: 50, offset: 50 });
  });

  it("허용 밖 limit(80) → 20, surface 필터 후 total", async () => {
    const j = await json<{ surface: string }>(await feedGET(req("/api/admin/feed-emergency?part=logs&limit=80&surface=home")));
    expect(j.limit).toBe(20);
    expect(j.total).toBe(65);
    expect(j.items?.every((l) => l.surface === "home")).toBe(true);
  });

  it("파라미터 없으면 기존 번들 응답 (다른 호출자 호환)", async () => {
    const j = await json(await feedGET(req("/api/admin/feed-emergency")));
    expect(j.bundle).toBeDefined();
    expect(j.items).toBeUndefined();
  });

  it("DB 오류 → 500 load_failed (원문 노출 없음)", async () => {
    loadFeed.mockResolvedValue({ ok: false, reason: "error", message: "relation boom" });
    const res = await feedGET(req("/api/admin/feed-emergency?part=logs"));
    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("load_failed");
  });
});

describe("ops-knowledge ?part=search-logs · recommendation-logs · recent-views", () => {
  const bundle = {
    version: 1,
    searchLogs: rows(45, (i) => ({ id: `s${i}`, adminId: "admin1", query: "q", filters: {}, resultCount: 1, createdAt: iso(i) })),
    recommendationLogs: rows(33, (i) => ({ id: `r${i}`, sourceType: "incident", createdAt: iso(i) })),
    recentViews: rows(25, (i) => ({ id: `v${i}`, adminId: i < 20 ? "admin1" : "admin2", documentId: "d", viewedAt: iso(i) })),
  };
  beforeEach(() => loadKnowledge.mockResolvedValue(ok(bundle)));

  it("검색 로그 45건 — 고정 30건 없이 total 45, 3쪽(20) = 5건", async () => {
    const j = await json(await knowledgeGET(req("/api/admin/ops-knowledge?part=search-logs&limit=20&offset=40")));
    expect(j.total).toBe(45);
    expect(j.items).toHaveLength(5);
  });

  it("추천 로그 33건 — limit 100 한 쪽에 전부", async () => {
    const j = await json(await knowledgeGET(req("/api/admin/ops-knowledge?part=recommendation-logs&limit=100")));
    expect(j.total).toBe(33);
    expect(j.items).toHaveLength(33);
  });

  it("최근 열람 — admin_id 필터, 고정 15건 없음", async () => {
    const j = await json(await knowledgeGET(req("/api/admin/ops-knowledge?part=recent-views&admin_id=admin1&limit=50")));
    expect(j.total).toBe(20);
    expect(j.items).toHaveLength(20);
  });

  it("파라미터 없으면 번들 응답", async () => {
    expect((await json(await knowledgeGET(req("/api/admin/ops-knowledge")))).bundle).toBeDefined();
  });
});

describe("automation · ops-learning · ops-routines · ops-runbooks · performance-ops", () => {
  it("automation ?part=logs — triggeredAt 최신순, total", async () => {
    loadAutomation.mockResolvedValue(
      ok({ version: 1, rules: [], logs: rows(57, (i) => ({ id: `a${i}`, ruleId: "r", triggeredAt: iso(i), actionResult: "" })) })
    );
    const j = await json<{ id: string }>(await automationGET(req("/api/admin/automation?part=logs&limit=50")));
    expect(j.total).toBe(57);
    expect(j.items).toHaveLength(50);
    expect(j.items?.[0].id).toBe("a56");
  });

  it("ops-learning ?part=pattern-logs — pattern_id 필터, 고정 30건 없음", async () => {
    loadLearning.mockResolvedValue(
      ok({
        version: 1,
        responseQualityFeedback: [],
        learningHistories: [],
        issuePatterns: [],
        improvementSuggestions: [],
        patternLogs: rows(90, (i) => ({ id: `p${i}`, patternId: i < 60 ? "pa" : "pb", createdAt: iso(i) })),
      })
    );
    const j = await json(await learningGET(req("/api/admin/ops-learning?part=pattern-logs&pattern_id=pa&limit=50&offset=50")));
    expect(j.total).toBe(60);
    expect(j.items).toHaveLength(10);
  });

  it("ops-routines ?part=executions — 주기·상태 필터, scheduledDate 최신순", async () => {
    loadRoutines.mockResolvedValue(
      ok({
        version: 1,
        routineTemplates: [],
        monthlyNotes: [],
        routineExecutions: rows(120, (i) => ({
          id: `e${i}`,
          periodType: i % 3 === 0 ? "weekly" : "monthly",
          status: i % 2 === 0 ? "done" : "todo",
          scheduledDate: iso(i),
        })),
      })
    );
    const all = await json(await routinesGET(req("/api/admin/ops-routines?part=executions&limit=100")));
    expect(all.total).toBe(120);
    const f = await json<{ periodType: string; status: string }>(
      await routinesGET(req("/api/admin/ops-routines?part=executions&period=weekly&exec_status=done"))
    );
    expect(f.total).toBe(20);
    expect(f.items?.every((e) => e.periodType === "weekly" && e.status === "done")).toBe(true);
  });

  it("ops-runbooks ?part=executions — 상태 필터, 고정 100건 없음", async () => {
    loadRunbooks.mockResolvedValue(
      ok({
        version: 1,
        executionSteps: [],
        executionLogs: [],
        results: [],
        executions: rows(150, (i) => ({ id: `x${i}`, executionStatus: i < 110 ? "completed" : "aborted", startedAt: iso(i) })),
      })
    );
    const all = await json(await runbooksGET(req("/api/admin/ops-runbooks?part=executions&limit=100&offset=100")));
    expect(all.total).toBe(150);
    expect(all.items).toHaveLength(50);
    const f = await json(await runbooksGET(req("/api/admin/ops-runbooks?part=executions&status=completed")));
    expect(f.total).toBe(110);
  });

  it("performance-ops ?part=slow-queries — detectedAt 최신순", async () => {
    loadPerf.mockResolvedValue(
      ok({ version: 1, metrics: [], slowQueries: rows(41, (i) => ({ id: `q${i}`, queryName: "q", duration: 1, route: "/", detectedAt: iso(i) })) })
    );
    const j = await json<{ id: string }>(await perfGET(req("/api/admin/performance-ops?part=slow-queries&limit=20&offset=40")));
    expect(j.total).toBe(41);
    expect(j.items?.map((q) => q.id)).toEqual(["q0"]);
  });

  it("모르는 part → 400 invalid_part", async () => {
    loadPerf.mockResolvedValue(ok({ version: 1, metrics: [], slowQueries: [] }));
    const res = await perfGET(req("/api/admin/performance-ops?part=nope"));
    expect(res.status).toBe(400);
  });
});

describe("app-settings ?part=change-logs (설정 변경 이력 — 자체 30건 쪽 대체)", () => {
  it("total = 저장 이력 전체, 쪽 단위 응답", async () => {
    loadAppSettings.mockResolvedValue(
      ok({ version: 1, settings: {}, changeLogs: rows(75, (i) => ({ id: `c${i}`, key: "siteName", createdAt: iso(i) })) })
    );
    const j = await json<{ id: string }>(await appSettingsGET(req("/api/admin/app-settings?part=change-logs&limit=50&offset=50")));
    expect(j.total).toBe(75);
    expect(j.items).toHaveLength(25);
    expect(j.items?.[0].id).toBe("c24");
  });

  it("DB 오류 → 500 (기본값으로 숨기지 않음)", async () => {
    loadAppSettings.mockResolvedValue({ ok: false, reason: "error", message: "x" });
    expect((await appSettingsGET(req("/api/admin/app-settings?part=change-logs"))).status).toBe(500);
  });
});

describe("deploy/status ?part=history (감사 30건·최근 20건 상한 제거)", () => {
  it("전체 이력을 받아 쪽으로 자른다", async () => {
    listPromotionHistory.mockReturnValue(
      rows(64, (i) => ({ at: iso(i), sha: `sha${i}`, action: "evidence", actorUserId: "system" }))
    );
    listRecent.mockReturnValue([]);
    const j = await json<{ sha: string }>(await deployStatusGET(req("/api/admin/deploy/status?part=history&limit=50&offset=50")));
    expect(listPromotionHistory).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER);
    expect(j.total).toBe(64);
    expect(j.items).toHaveLength(14);
    expect(j.items?.[0].sha).toBe("sha13");
  });
});
