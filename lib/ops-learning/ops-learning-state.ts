/**
 * 운영 학습 — 패턴·히스토리·품질 피드백·개선 제안 단일 저장소.
 * 영속화: `ops-learning-db` + `/api/admin/ops-learning`
 */
import type {
  OpsResponseQualityFeedback,
  OpsPatternLog,
  OpsLearningHistory,
  OpsLearningStatus,
  OpsIssuePattern,
  OpsImprovementSuggestion,
  OpsSuggestionStatus,
} from "@/lib/types/ops-learning";

function defaultResponseQualityFeedback(): OpsResponseQualityFeedback[] {
  return [
    {
      id: "orqf-1",
      incidentId: "ri-1",
      runbookExecutionId: null,
      primaryDocumentId: "od-1",
      responseQualityScore: 0.8,
      resolutionSpeedScore: 0.75,
      documentFitScore: 0.85,
      automationHelpScore: null,
      followupNeeded: false,
      feedbackSummary: "빈 피드 이슈에 플레이북 참조로 대응, 해결 시간 단축",
      createdAt: new Date(Date.now() - 12 * 3600000).toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
    {
      id: "orqf-2",
      incidentId: "inc-1",
      runbookExecutionId: "ore-1",
      primaryDocumentId: "od-1",
      responseQualityScore: 0.9,
      resolutionSpeedScore: 0.85,
      documentFitScore: 0.9,
      automationHelpScore: 0.7,
      followupNeeded: true,
      feedbackSummary: "Fallback 대응 플레이북 실행, 결과 양호. 후속 모니터링 필요",
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
    {
      id: "orqf-3",
      incidentId: "deploy-1",
      runbookExecutionId: "ore-2",
      primaryDocumentId: "od-3",
      responseQualityScore: 0.95,
      resolutionSpeedScore: 0.9,
      documentFitScore: 0.95,
      automationHelpScore: null,
      followupNeeded: true,
      feedbackSummary: "롤백 시나리오 적용 완료, 지표 정상화",
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
  ];
}

function defaultPatternLogs(): OpsPatternLog[] {
  return [
    {
      id: "opl-1",
      patternId: "oip-1",
      actionType: "detect",
      actorType: "system",
      actorId: "system",
      actorNickname: "시스템",
      note: "반복 패턴 탐지",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "opl-2",
      patternId: "oip-1",
      actionType: "link_document",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "od-1 플레이북 연결",
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: "opl-3",
      patternId: "oip-2",
      actionType: "mark_mitigated",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "롤백 시나리오 적용으로 완화",
      createdAt: new Date(Date.now() - 23 * 3600000).toISOString(),
    },
  ];
}

function defaultLearningHistories(): OpsLearningHistory[] {
  return [
    {
      id: "olh-1",
      title: "홈 빈 피드 반복 이슈",
      summary: "empty_feed_spike가 home surface에서 반복 발생",
      sourceType: "incident",
      sourceId: "ri-1",
      surface: "home",
      learningType: "repeated_issue",
      status: "reviewing",
      detectedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      note: "",
    },
    {
      id: "olh-2",
      title: "롤백 시나리오 문서 활용 개선",
      summary: "runbook 결과와 incident outcome 비교 후 문서 적합도 개선 제안",
      sourceType: "runbook",
      sourceId: "ore-2",
      surface: "all",
      learningType: "quality_improvement",
      status: "action_created",
      detectedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      note: "액션아이템 oai-1 연결",
    },
    {
      id: "olh-3",
      title: "Fallback 대응 문서 갭",
      summary: "documentFitScore 낮음으로 문서 보강 제안",
      sourceType: "incident",
      sourceId: "inc-1",
      surface: "home",
      learningType: "document_gap",
      status: "detected",
      detectedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
      ownerAdminId: null,
      ownerAdminNickname: null,
      note: "",
    },
  ];
}

function defaultIssuePatterns(): OpsIssuePattern[] {
  return [
    {
      id: "oip-1",
      patternKey: "home_empty_feed_spike",
      title: "홈 빈 피드 일시 증가 반복",
      surface: "home",
      incidentType: "empty_feed_spike",
      sectionKey: null,
      versionId: null,
      category: "recommendation",
      occurrenceCount: 3,
      firstOccurredAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      lastOccurredAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      avgResolutionMinutes: 120,
      recurrenceRate: 0.4,
      severityTrend: "stable",
      linkedDocumentId: "od-1",
      linkedRunbookDocumentId: "od-1",
      status: "reviewing",
    },
    {
      id: "oip-2",
      patternKey: "all_rollback_version",
      title: "추천 버전 롤백 관련 패턴",
      surface: "all",
      incidentType: "rollback",
      sectionKey: null,
      versionId: "rv-1",
      category: "rollback",
      occurrenceCount: 2,
      firstOccurredAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      lastOccurredAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      avgResolutionMinutes: 60,
      recurrenceRate: 0.2,
      severityTrend: "decreasing",
      linkedDocumentId: "od-3",
      linkedRunbookDocumentId: "od-3",
      status: "mitigated",
    },
    {
      id: "oip-3",
      patternKey: "home_fallback",
      title: "홈 Fallback 발생 패턴",
      surface: "home",
      incidentType: "fallback",
      sectionKey: "personalized",
      versionId: null,
      category: "incident_response",
      occurrenceCount: 1,
      firstOccurredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      lastOccurredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      avgResolutionMinutes: null,
      recurrenceRate: null,
      severityTrend: "stable",
      linkedDocumentId: "od-1",
      linkedRunbookDocumentId: null,
      status: "detected",
    },
  ];
}

function defaultImprovementSuggestions(): OpsImprovementSuggestion[] {
  return [
    {
      id: "ois-1",
      patternId: "oip-1",
      suggestionType: "document_update",
      title: "빈 피드 플레이북에 임계치 체크 단계 추가",
      description: "empty_feed_spike 발생 전 알림 임계치 검토 단계를 문서에 추가 제안",
      status: "proposed",
      linkedActionItemId: null,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "ois-2",
      patternId: "oip-1",
      suggestionType: "alert_threshold_change",
      title: "홈 빈 피드 알림 임계치 조정",
      description: "현재 임계치로는 반복 발생 시점에 알림이 늦음. 상향 조정 검토",
      status: "approved",
      linkedActionItemId: "oai-1",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: "ois-3",
      patternId: "oip-3",
      suggestionType: "new_runbook",
      title: "Fallback 자동 복구 런북 신규 작성",
      description: "Fallback 발생 시 자동 복구 시나리오 문서화",
      status: "proposed",
      linkedActionItemId: null,
      createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
  ];
}

const RESPONSE_QUALITY_FEEDBACK: OpsResponseQualityFeedback[] =
  defaultResponseQualityFeedback();
const PATTERN_LOGS: OpsPatternLog[] = defaultPatternLogs();
const LEARNING_HISTORIES: OpsLearningHistory[] = defaultLearningHistories();
const ISSUE_PATTERNS: OpsIssuePattern[] = defaultIssuePatterns();
const IMPROVEMENT_SUGGESTIONS: OpsImprovementSuggestion[] =
  defaultImprovementSuggestions();

export type OpsLearningBundleV1 = {
  version: 1;
  responseQualityFeedback: OpsResponseQualityFeedback[];
  patternLogs: OpsPatternLog[];
  learningHistories: OpsLearningHistory[];
  issuePatterns: OpsIssuePattern[];
  improvementSuggestions: OpsImprovementSuggestion[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultOpsLearningBundle(): OpsLearningBundleV1 {
  return {
    version: 1,
    responseQualityFeedback: defaultResponseQualityFeedback().map((f) => ({ ...f })),
    patternLogs: defaultPatternLogs().map((l) => ({ ...l })),
    learningHistories: defaultLearningHistories().map((h) => ({ ...h })),
    issuePatterns: defaultIssuePatterns().map((p) => ({ ...p })),
    improvementSuggestions: defaultImprovementSuggestions().map((s) => ({ ...s })),
  };
}

export function importOpsLearningBundle(bundle: OpsLearningBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(
    RESPONSE_QUALITY_FEEDBACK,
    (bundle.responseQualityFeedback ?? []).map((f) => ({ ...f }))
  );
  replaceArray(PATTERN_LOGS, (bundle.patternLogs ?? []).map((l) => ({ ...l })));
  replaceArray(
    LEARNING_HISTORIES,
    (bundle.learningHistories ?? []).map((h) => ({ ...h }))
  );
  replaceArray(ISSUE_PATTERNS, (bundle.issuePatterns ?? []).map((p) => ({ ...p })));
  replaceArray(
    IMPROVEMENT_SUGGESTIONS,
    (bundle.improvementSuggestions ?? []).map((s) => ({ ...s }))
  );
  if (!RESPONSE_QUALITY_FEEDBACK.length)
    replaceArray(RESPONSE_QUALITY_FEEDBACK, defaultResponseQualityFeedback());
  if (!PATTERN_LOGS.length) replaceArray(PATTERN_LOGS, defaultPatternLogs());
  if (!LEARNING_HISTORIES.length)
    replaceArray(LEARNING_HISTORIES, defaultLearningHistories());
  if (!ISSUE_PATTERNS.length) replaceArray(ISSUE_PATTERNS, defaultIssuePatterns());
  if (!IMPROVEMENT_SUGGESTIONS.length)
    replaceArray(IMPROVEMENT_SUGGESTIONS, defaultImprovementSuggestions());
}

export function exportOpsLearningBundle(): OpsLearningBundleV1 {
  return {
    version: 1,
    responseQualityFeedback: RESPONSE_QUALITY_FEEDBACK.map((f) => ({ ...f })),
    patternLogs: PATTERN_LOGS.map((l) => ({ ...l })),
    learningHistories: LEARNING_HISTORIES.map((h) => ({ ...h })),
    issuePatterns: ISSUE_PATTERNS.map((p) => ({ ...p })),
    improvementSuggestions: IMPROVEMENT_SUGGESTIONS.map((s) => ({ ...s })),
  };
}

/* ─── response quality feedback ─────────────────────────────── */

export function getOpsResponseQualityFeedback(filters?: {
  incidentId?: string;
  limit?: number;
}): OpsResponseQualityFeedback[] {
  let list = [...RESPONSE_QUALITY_FEEDBACK].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.incidentId) list = list.filter((f) => f.incidentId === filters.incidentId);
  const limit = filters?.limit ?? 30;
  return list.slice(0, limit);
}

/* ─── pattern logs ──────────────────────────────────────────── */

export function getOpsPatternLogs(
  patternId: string,
  options?: { limit?: number }
): OpsPatternLog[] {
  const list = PATTERN_LOGS.filter((l) => l.patternId === patternId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const limit = options?.limit ?? 30;
  return list.slice(0, limit);
}

export function addOpsPatternLog(input: Omit<OpsPatternLog, "id">): OpsPatternLog {
  const log: OpsPatternLog = {
    ...input,
    id: `opl-${Date.now()}`,
  };
  PATTERN_LOGS.unshift(log);
  return log;
}

/* ─── learning histories ────────────────────────────────────── */

export function getOpsLearningHistories(filters?: {
  status?: OpsLearningStatus;
  learningType?: string;
  surface?: string;
  limit?: number;
}): OpsLearningHistory[] {
  let list = [...LEARNING_HISTORIES].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
  if (filters?.status) list = list.filter((h) => h.status === filters.status);
  if (filters?.learningType) list = list.filter((h) => h.learningType === filters.learningType);
  if (filters?.surface) list = list.filter((h) => h.surface === filters.surface);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getOpsLearningHistoryById(id: string): OpsLearningHistory | undefined {
  return LEARNING_HISTORIES.find((h) => h.id === id);
}

/* ─── issue patterns ────────────────────────────────────────── */

export function getOpsIssuePatterns(filters?: {
  status?: OpsLearningStatus;
  surface?: string;
  incidentType?: string;
  limit?: number;
}): OpsIssuePattern[] {
  let list = [...ISSUE_PATTERNS].sort(
    (a, b) => new Date(b.lastOccurredAt).getTime() - new Date(a.lastOccurredAt).getTime()
  );
  if (filters?.status) list = list.filter((p) => p.status === filters.status);
  if (filters?.surface) list = list.filter((p) => p.surface === filters.surface);
  if (filters?.incidentType) list = list.filter((p) => p.incidentType === filters.incidentType);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getOpsIssuePatternById(id: string): OpsIssuePattern | undefined {
  return ISSUE_PATTERNS.find((p) => p.id === id);
}

export function getOpsIssuePatternByPatternKey(
  patternKey: string
): OpsIssuePattern | undefined {
  return ISSUE_PATTERNS.find((p) => p.patternKey === patternKey);
}

/* ─── improvement suggestions ───────────────────────────────── */

export function getOpsImprovementSuggestions(filters?: {
  patternId?: string;
  status?: OpsSuggestionStatus;
  limit?: number;
}): OpsImprovementSuggestion[] {
  let list = [...IMPROVEMENT_SUGGESTIONS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.patternId) list = list.filter((s) => s.patternId === filters.patternId);
  if (filters?.status) list = list.filter((s) => s.status === filters.status);
  const limit = filters?.limit ?? 30;
  return list.slice(0, limit);
}

export function getOpsImprovementSuggestionById(
  id: string
): OpsImprovementSuggestion | undefined {
  return IMPROVEMENT_SUGGESTIONS.find((s) => s.id === id);
}
