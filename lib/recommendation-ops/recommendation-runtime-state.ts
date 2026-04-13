/**
 * 추천 운영 런타임 데이터 — 이슈·알림 이벤트·자동화 실행 이력 (admin_settings 영속화).
 */
import type {
  RecommendationAutomationExecution,
  AutomationActionType,
} from "@/lib/types/recommendation-automation";
import type {
  RecommendationAlertEvent,
  RecommendationIncident,
  IncidentStatus,
} from "@/lib/types/recommendation-monitoring";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const MAX_INCIDENTS = 200;
const MAX_ALERT_EVENTS = 200;
const MAX_EXECUTIONS = 300;

function isoNow() {
  return new Date().toISOString();
}

function defaultIncidents(): RecommendationIncident[] {
  const now = Date.now();
  return [
    {
      id: "ri-1",
      surface: "home",
      severity: "medium",
      incidentType: "empty_feed_spike",
      title: "홈 빈 피드 일시 증가",
      description: "일시적으로 빈 피드 비율이 상승했습니다.",
      status: "resolved",
      relatedVersionId: null,
      relatedDeploymentId: null,
      startedAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      resolvedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
      acknowledgedAt: new Date(now - 1000 * 60 * 60 * 23).toISOString(),
      acknowledgedByAdminId: "admin1",
      acknowledgedByAdminNickname: "관리자",
    },
  ];
}

function defaultAlertEvents(): RecommendationAlertEvent[] {
  const now = Date.now();
  return [
    {
      id: "rae-1",
      ruleId: "rar-1",
      surface: "home",
      severity: "warning",
      metricKey: "empty_feed_rate",
      currentValue: 0.18,
      thresholdValue: 0.15,
      message: "홈 empty_feed_rate 0.18이(가) 임계치 0.15 초과",
      isAcknowledged: true,
      acknowledgedAt: new Date(now - 1000 * 60 * 30).toISOString(),
      acknowledgedByAdminId: "admin1",
      createdAt: new Date(now - 1000 * 60 * 45).toISOString(),
    },
  ];
}

function defaultExecutions(): RecommendationAutomationExecution[] {
  const now = Date.now();
  return [
    {
      id: "rex-seed-1",
      surface: "home",
      incidentId: null,
      actionType: "auto_fallback",
      executionMode: "dry_run",
      status: "skipped",
      reason: "emptyFeedRate 0.02 < threshold 0.15",
      beforeState: "normal",
      afterState: "normal",
      createdAt: new Date(now - 1000 * 60 * 30).toISOString(),
      completedAt: new Date(now - 1000 * 60 * 30).toISOString(),
    },
  ];
}

const INCIDENTS: RecommendationIncident[] = defaultIncidents();
const ALERT_EVENTS: RecommendationAlertEvent[] = defaultAlertEvents();
const AUTOMATION_EXECUTIONS: RecommendationAutomationExecution[] = defaultExecutions();

export type RecommendationRuntimeBundleV1 = {
  version: 1;
  incidents: RecommendationIncident[];
  alertEvents: RecommendationAlertEvent[];
  automationExecutions: RecommendationAutomationExecution[];
};

function replaceArray<T>(target: T[], next: T[], max: number) {
  target.length = 0;
  target.push(...next.slice(0, max));
}

function trimStore() {
  if (INCIDENTS.length > MAX_INCIDENTS) INCIDENTS.length = MAX_INCIDENTS;
  if (ALERT_EVENTS.length > MAX_ALERT_EVENTS) ALERT_EVENTS.length = MAX_ALERT_EVENTS;
  if (AUTOMATION_EXECUTIONS.length > MAX_EXECUTIONS) AUTOMATION_EXECUTIONS.length = MAX_EXECUTIONS;
}

export function createDefaultRecommendationRuntimeBundle(): RecommendationRuntimeBundleV1 {
  return {
    version: 1,
    incidents: defaultIncidents().map((x) => ({ ...x })),
    alertEvents: defaultAlertEvents().map((x) => ({ ...x })),
    automationExecutions: defaultExecutions().map((x) => ({ ...x })),
  };
}

export function importRecommendationRuntimeBundle(bundle: RecommendationRuntimeBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(INCIDENTS, (bundle.incidents ?? []).map((x) => ({ ...x })), MAX_INCIDENTS);
  replaceArray(ALERT_EVENTS, (bundle.alertEvents ?? []).map((x) => ({ ...x })), MAX_ALERT_EVENTS);
  replaceArray(
    AUTOMATION_EXECUTIONS,
    (bundle.automationExecutions ?? []).map((x) => ({ ...x })),
    MAX_EXECUTIONS
  );
  if (!INCIDENTS.length) replaceArray(INCIDENTS, defaultIncidents(), MAX_INCIDENTS);
  if (!ALERT_EVENTS.length) replaceArray(ALERT_EVENTS, defaultAlertEvents(), MAX_ALERT_EVENTS);
  if (!AUTOMATION_EXECUTIONS.length)
    replaceArray(AUTOMATION_EXECUTIONS, defaultExecutions(), MAX_EXECUTIONS);
}

export function exportRecommendationRuntimeBundle(): RecommendationRuntimeBundleV1 {
  return {
    version: 1,
    incidents: INCIDENTS.map((x) => ({ ...x })),
    alertEvents: ALERT_EVENTS.map((x) => ({ ...x })),
    automationExecutions: AUTOMATION_EXECUTIONS.map((x) => ({ ...x })),
  };
}

/* ─── incidents ─────────────────────────────────────────────── */

export function getRecommendationIncidents(filters?: {
  surface?: RecommendationSurface;
  status?: IncidentStatus;
}): RecommendationIncident[] {
  let list = [...INCIDENTS].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  if (filters?.surface) list = list.filter((i) => i.surface === filters.surface);
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  return list;
}

export function getRecommendationIncidentById(id: string): RecommendationIncident | undefined {
  return INCIDENTS.find((i) => i.id === id);
}

export function addRecommendationIncident(
  input: Omit<
    RecommendationIncident,
    "id" | "resolvedAt" | "acknowledgedAt" | "acknowledgedByAdminId" | "acknowledgedByAdminNickname"
  >
): RecommendationIncident {
  const incident: RecommendationIncident = {
    ...input,
    id: `ri-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    resolvedAt: null,
    acknowledgedAt: null,
    acknowledgedByAdminId: null,
    acknowledgedByAdminNickname: null,
  };
  INCIDENTS.unshift(incident);
  trimStore();
  return { ...incident };
}

export function acknowledgeIncident(
  id: string,
  adminId: string,
  adminNickname: string
): RecommendationIncident | null {
  const inc = INCIDENTS.find((i) => i.id === id);
  if (!inc) return null;
  const now = isoNow();
  inc.status = "acknowledged";
  inc.acknowledgedAt = now;
  inc.acknowledgedByAdminId = adminId;
  inc.acknowledgedByAdminNickname = adminNickname;
  return { ...inc };
}

export function resolveIncident(id: string): RecommendationIncident | null {
  const inc = INCIDENTS.find((i) => i.id === id);
  if (!inc) return null;
  inc.status = "resolved";
  inc.resolvedAt = isoNow();
  return { ...inc };
}

/* ─── alert events ────────────────────────────────────────── */

export function getRecommendationAlertEvents(filters?: {
  surface?: RecommendationSurface;
  isAcknowledged?: boolean;
  limit?: number;
}): RecommendationAlertEvent[] {
  let list = [...ALERT_EVENTS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.surface) list = list.filter((e) => e.surface === filters.surface);
  if (filters?.isAcknowledged !== undefined)
    list = list.filter((e) => e.isAcknowledged === filters.isAcknowledged);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function addRecommendationAlertEvent(
  input: Omit<
    RecommendationAlertEvent,
    "id" | "isAcknowledged" | "acknowledgedAt" | "acknowledgedByAdminId"
  >
): RecommendationAlertEvent {
  const ev: RecommendationAlertEvent = {
    ...input,
    id: `rae-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    isAcknowledged: false,
    acknowledgedAt: null,
    acknowledgedByAdminId: null,
  };
  ALERT_EVENTS.unshift(ev);
  trimStore();
  return { ...ev };
}

export function acknowledgeAlertEvent(id: string, adminId: string): RecommendationAlertEvent | null {
  const ev = ALERT_EVENTS.find((e) => e.id === id);
  if (!ev) return null;
  ev.isAcknowledged = true;
  ev.acknowledgedAt = isoNow();
  ev.acknowledgedByAdminId = adminId;
  return { ...ev };
}

/* ─── automation executions ───────────────────────────────── */

export function getRecommendationAutomationExecutions(filters?: {
  surface?: RecommendationSurface;
  actionType?: AutomationActionType;
  limit?: number;
}): RecommendationAutomationExecution[] {
  let list = [...AUTOMATION_EXECUTIONS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.surface) list = list.filter((e) => e.surface === filters.surface);
  if (filters?.actionType) list = list.filter((e) => e.actionType === filters.actionType);
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function addRecommendationAutomationExecution(
  input: Omit<RecommendationAutomationExecution, "id" | "createdAt" | "completedAt"> & {
    completedAt?: string | null;
  }
): RecommendationAutomationExecution {
  const now = isoNow();
  const exec: RecommendationAutomationExecution = {
    ...input,
    id: `rex-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    completedAt: input.completedAt ?? now,
  };
  AUTOMATION_EXECUTIONS.unshift(exec);
  trimStore();
  return { ...exec };
}
