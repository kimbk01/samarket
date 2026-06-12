/**
 * 운영 성숙도 — 점수·팀 KPI·개선 로드맵 단일 저장소.
 * 영속화: `ops-maturity-db` + `/api/admin/ops-maturity`
 */
import type {
  OpsMaturityScores,
  OpsMaturityScope,
  OpsTeamKpis,
  OpsKpiPeriodType,
  OpsImprovementRoadmapItem,
  OpsRoadmapStatus,
  OpsRoadmapDomain,
} from "@/lib/types/ops-maturity";

function isoNow() {
  return new Date().toISOString();
}

function weekKey(d: Date): string {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function defaultMaturityScores(): OpsMaturityScores[] {
  const now = isoNow();
  return [
    {
      id: "oms-1",
      scoreDate: now.slice(0, 10),
      scope: "weekly",
      overallScore: 72,
      monitoringScore: 78,
      automationScore: 65,
      documentationScore: 80,
      responseScore: 70,
      recommendationQualityScore: 75,
      learningScore: 68,
      createdAt: now,
      updatedAt: now,
      note: "",
    },
    {
      id: "oms-2",
      scoreDate: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      scope: "weekly",
      overallScore: 70,
      monitoringScore: 75,
      automationScore: 62,
      documentationScore: 78,
      responseScore: 68,
      recommendationQualityScore: 73,
      learningScore: 65,
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      note: "",
    },
    {
      id: "oms-3",
      scoreDate: now.slice(0, 7) + "-01",
      scope: "monthly",
      overallScore: 71,
      monitoringScore: 76,
      automationScore: 64,
      documentationScore: 79,
      responseScore: 69,
      recommendationQualityScore: 74,
      learningScore: 66,
      createdAt: now,
      updatedAt: now,
      note: "",
    },
  ];
}

function defaultTeamKpis(): OpsTeamKpis[] {
  const now = new Date();
  const thisWeek = weekKey(now);
  const lastWeek = weekKey(new Date(now.getTime() - 7 * 86400000));
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const ts = isoNow();

  return [
    {
      id: "otk-1",
      periodKey: thisWeek,
      periodType: "weekly",
      incidentAvgResolutionMinutes: 95,
      fallbackRate: 0.02,
      rollbackSuccessRate: 0.9,
      documentFreshnessRate: 0.85,
      checklistCompletionRate: 0.88,
      actionCompletionRate: 0.75,
      ctrChangeRate: 0.02,
      conversionRateChange: 0.01,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "otk-2",
      periodKey: lastWeek,
      periodType: "weekly",
      incidentAvgResolutionMinutes: 120,
      fallbackRate: 0.03,
      rollbackSuccessRate: 0.85,
      documentFreshnessRate: 0.82,
      checklistCompletionRate: 0.8,
      actionCompletionRate: 0.7,
      ctrChangeRate: -0.01,
      conversionRateChange: 0,
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
    {
      id: "otk-3",
      periodKey: thisMonth,
      periodType: "monthly",
      incidentAvgResolutionMinutes: 100,
      fallbackRate: 0.025,
      rollbackSuccessRate: 0.88,
      documentFreshnessRate: 0.84,
      checklistCompletionRate: 0.85,
      actionCompletionRate: 0.72,
      ctrChangeRate: 0.015,
      conversionRateChange: 0.008,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "otk-4",
      periodKey: lastMonth,
      periodType: "monthly",
      incidentAvgResolutionMinutes: 110,
      fallbackRate: 0.03,
      rollbackSuccessRate: 0.85,
      documentFreshnessRate: 0.8,
      checklistCompletionRate: 0.78,
      actionCompletionRate: 0.68,
      ctrChangeRate: 0,
      conversionRateChange: 0,
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

function defaultRoadmapItems(): OpsImprovementRoadmapItem[] {
  return [
    {
      id: "oir-1",
      title: "빈 피드 알림 임계치 조정",
      description: "반복 이슈 패턴 oip-1 기반. 알림 임계치 상향으로 조기 대응",
      sourceType: "learning_pattern",
      sourceId: "oip-1",
      domain: "monitoring",
      status: "in_progress",
      priority: "high",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      targetScore: 80,
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      milestone: "Q1 모니터링 강화",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      note: "",
    },
    {
      id: "oir-2",
      title: "Fallback 자동 복구 런북 문서화",
      description: "document_gap 학습 기반. 신규 런북 작성",
      sourceType: "learning_pattern",
      sourceId: "oip-3",
      domain: "documentation",
      status: "planned",
      priority: "medium",
      ownerAdminId: null,
      ownerAdminNickname: null,
      targetScore: null,
      dueDate: null,
      milestone: "Q1 문서화",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      completedAt: null,
      note: "",
    },
    {
      id: "oir-3",
      title: "롤백 시나리오 실행률 개선",
      description: "액션아이템 oai-1 연동. 롤백 성공률 95% 목표",
      sourceType: "action_item",
      sourceId: "oai-1",
      domain: "response",
      status: "approved",
      priority: "high",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      targetScore: 85,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      milestone: "Q1 대응 속도",
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      note: "",
    },
    {
      id: "oir-4",
      title: "일간 체크리스트 자동 생성",
      description: "매일 오전 9시 템플릿 기반 체크리스트 자동 생성",
      sourceType: "manual",
      sourceId: null,
      domain: "automation",
      status: "completed",
      priority: "medium",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      targetScore: 75,
      dueDate: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      milestone: "Q1 자동화",
      createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      completedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      note: "적용 완료",
    },
  ];
}

const MATURITY_SCORES: OpsMaturityScores[] = defaultMaturityScores();
const TEAM_KPIS: OpsTeamKpis[] = defaultTeamKpis();
const ROADMAP_ITEMS: OpsImprovementRoadmapItem[] = defaultRoadmapItems();

export type OpsMaturityBundleV1 = {
  version: 1;
  maturityScores: OpsMaturityScores[];
  teamKpis: OpsTeamKpis[];
  roadmapItems: OpsImprovementRoadmapItem[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultOpsMaturityBundle(): OpsMaturityBundleV1 {
  return {
    version: 1,
    maturityScores: defaultMaturityScores().map((s) => ({ ...s })),
    teamKpis: defaultTeamKpis().map((k) => ({ ...k })),
    roadmapItems: defaultRoadmapItems().map((i) => ({ ...i })),
  };
}

export function importOpsMaturityBundle(bundle: OpsMaturityBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(
    MATURITY_SCORES,
    (bundle.maturityScores ?? []).map((s) => ({ ...s }))
  );
  replaceArray(TEAM_KPIS, (bundle.teamKpis ?? []).map((k) => ({ ...k })));
  replaceArray(
    ROADMAP_ITEMS,
    (bundle.roadmapItems ?? []).map((i) => ({ ...i }))
  );
  if (!MATURITY_SCORES.length)
    replaceArray(MATURITY_SCORES, defaultMaturityScores());
  if (!TEAM_KPIS.length) replaceArray(TEAM_KPIS, defaultTeamKpis());
  if (!ROADMAP_ITEMS.length) replaceArray(ROADMAP_ITEMS, defaultRoadmapItems());
}

export function exportOpsMaturityBundle(): OpsMaturityBundleV1 {
  return {
    version: 1,
    maturityScores: MATURITY_SCORES.map((s) => ({ ...s })),
    teamKpis: TEAM_KPIS.map((k) => ({ ...k })),
    roadmapItems: ROADMAP_ITEMS.map((i) => ({ ...i })),
  };
}

/* ─── maturity scores ───────────────────────────────────────── */

export function getOpsMaturityScores(filters?: {
  scope?: OpsMaturityScope;
  limit?: number;
}): OpsMaturityScores[] {
  let list = [...MATURITY_SCORES].sort(
    (a, b) => new Date(b.scoreDate).getTime() - new Date(a.scoreDate).getTime()
  );
  if (filters?.scope) list = list.filter((s) => s.scope === filters.scope);
  const limit = filters?.limit ?? 20;
  return list.slice(0, limit);
}

export function getOpsMaturityScoreByDate(
  scoreDate: string,
  scope: OpsMaturityScope
): OpsMaturityScores | undefined {
  return MATURITY_SCORES.find((s) => s.scoreDate === scoreDate && s.scope === scope);
}

export function getLatestOpsMaturityScore(
  scope: OpsMaturityScope
): OpsMaturityScores | undefined {
  const list = MATURITY_SCORES.filter((s) => s.scope === scope).sort(
    (a, b) => new Date(b.scoreDate).getTime() - new Date(a.scoreDate).getTime()
  );
  return list[0];
}

/** periodKey: YYYY-MM-DD (주) 또는 YYYY-MM (달) */
export function getOpsMaturityScoreByPeriodKey(
  periodKey: string,
  scope: OpsMaturityScope
): OpsMaturityScores | undefined {
  return MATURITY_SCORES.find(
    (s) => s.scope === scope && (s.scoreDate === periodKey || s.scoreDate.startsWith(periodKey))
  );
}

/* ─── team KPIs ─────────────────────────────────────────────── */

export function getOpsTeamKpis(filters?: {
  periodType?: OpsKpiPeriodType;
  limit?: number;
}): OpsTeamKpis[] {
  let list = [...TEAM_KPIS].sort(
    (a, b) => new Date(b.periodKey).getTime() - new Date(a.periodKey).getTime()
  );
  if (filters?.periodType) list = list.filter((k) => k.periodType === filters.periodType);
  const limit = filters?.limit ?? 10;
  return list.slice(0, limit);
}

export function getOpsTeamKpiByPeriod(
  periodKey: string,
  periodType: OpsKpiPeriodType
): OpsTeamKpis | undefined {
  return TEAM_KPIS.find((k) => k.periodKey === periodKey && k.periodType === periodType);
}

/* ─── roadmap items ─────────────────────────────────────────── */

export function getOpsImprovementRoadmapItems(filters?: {
  status?: OpsRoadmapStatus;
  domain?: OpsRoadmapDomain;
  limit?: number;
}): OpsImprovementRoadmapItem[] {
  let list = [...ROADMAP_ITEMS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  if (filters?.domain) list = list.filter((i) => i.domain === filters.domain);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getOpsImprovementRoadmapItemById(
  id: string
): OpsImprovementRoadmapItem | undefined {
  return ROADMAP_ITEMS.find((i) => i.id === id);
}
