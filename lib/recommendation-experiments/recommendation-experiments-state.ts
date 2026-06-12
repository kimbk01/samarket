/**
 * 추천 실험·배포 — 피드 버전·A/B 실험·배정·배포 이력 단일 저장소.
 */
import type {
  FeedVersion,
  RecommendationExperiment,
  ExperimentStatus,
  ExperimentLog,
  ExperimentLogActionType,
  UserFeedAssignment,
  AssignedGroup,
} from "@/lib/types/recommendation-experiment";
import type {
  ActiveFeedVersion,
  RecommendationDeployment,
  DeploymentStatus,
  RecommendationDeploymentLog,
  DeploymentLogActionType,
  RecommendationRollbackPolicy,
  ExperimentWinnerSummary,
  WinningMetric,
  WinningGroup,
} from "@/lib/types/recommendation-deployment";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getExperimentMetrics } from "@/lib/recommendation-experiments/recommendation-experiment-metrics";

const MAX_LOGS = 200;
const ADMIN_ID = "admin1";
const ADMIN_NICKNAME = "관리자";

function isoNow() {
  return new Date().toISOString();
}

function defaultFeedVersions(): FeedVersion[] {
  const now = isoNow();
  return [
    {
      id: "fv-control-home",
      versionKey: "home_v1_control",
      versionName: "홈 대조군 v1",
      surface: "home",
      isActive: true,
      sectionConfig: [
        { sectionKey: "recommended", isActive: true, maxItems: 10 },
        { sectionKey: "local_latest", isActive: true, maxItems: 12 },
        { sectionKey: "bumped", isActive: true, maxItems: 6 },
        { sectionKey: "sponsored", isActive: true, maxItems: 4 },
        { sectionKey: "premium_shops", isActive: true, maxItems: 6 },
        { sectionKey: "recent_based", isActive: true, maxItems: 6 },
      ],
      scoringOverrides: {},
      dedupeStrategy: "global",
      notes: "기본 홈 피드",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fv-variant-a-home",
      versionKey: "home_v1_variant_a",
      versionName: "홈 실험군 A (추천 강화)",
      surface: "home",
      isActive: true,
      sectionConfig: [
        { sectionKey: "recommended", isActive: true, maxItems: 14 },
        { sectionKey: "local_latest", isActive: true, maxItems: 10 },
        { sectionKey: "bumped", isActive: true, maxItems: 4 },
        { sectionKey: "sponsored", isActive: true, maxItems: 4 },
        { sectionKey: "premium_shops", isActive: true, maxItems: 6 },
        { sectionKey: "recent_based", isActive: false, maxItems: 0 },
      ],
      scoringOverrides: {
        premiumBoostWeight: 12,
        businessBoostWeight: 6,
        bumpBoostWeight: 10,
      },
      dedupeStrategy: "global",
      notes: "추천 섹션 확대, recent_based off",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fv-variant-b-home",
      versionKey: "home_v1_variant_b",
      versionName: "홈 실험군 B (광고 비중 축소)",
      surface: "home",
      isActive: true,
      sectionConfig: [
        { sectionKey: "recommended", isActive: true, maxItems: 10 },
        { sectionKey: "local_latest", isActive: true, maxItems: 14 },
        { sectionKey: "bumped", isActive: true, maxItems: 8 },
        { sectionKey: "sponsored", isActive: true, maxItems: 2 },
        { sectionKey: "premium_shops", isActive: true, maxItems: 6 },
        { sectionKey: "recent_based", isActive: true, maxItems: 6 },
      ],
      scoringOverrides: {
        adBoostWeight: 10,
        pointPromotionBoostWeight: 8,
      },
      dedupeStrategy: "per_section",
      notes: "sponsored 축소, local_latest 확대",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function defaultExperiments(): RecommendationExperiment[] {
  const now = isoNow();
  return [
    {
      id: "exp-1",
      experimentName: "홈 추천 섹션 비중 실험",
      description: "추천 상품 섹션 확대 vs 대조군",
      status: "running",
      targetSurface: "home",
      controlVersionId: "fv-control-home",
      variantVersionIds: ["fv-variant-a-home", "fv-variant-b-home"],
      trafficAllocationType: "percentage",
      controlPercentage: 50,
      variantPercentages: [25, 25],
      targetRegions: [],
      targetMemberTypes: [],
      startAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      endAt: null,
      createdAt: now,
      updatedAt: now,
      adminMemo: "홈 피드 A/B 테스트",
    },
    {
      id: "exp-2",
      experimentName: "검색 추천 가중치 실험 (초안)",
      description: "검색 결과 추천 점수 가중치 차등",
      status: "draft",
      targetSurface: "search",
      controlVersionId: "fv-control-home",
      variantVersionIds: ["fv-variant-a-home"],
      trafficAllocationType: "percentage",
      controlPercentage: 70,
      variantPercentages: [30],
      targetRegions: [],
      targetMemberTypes: [],
      startAt: null,
      endAt: null,
      createdAt: now,
      updatedAt: now,
      adminMemo: "draft",
    },
  ];
}

function defaultExperimentLogs(): ExperimentLog[] {
  return [
    {
      id: "el-1",
      experimentId: "exp-1",
      actionType: "create",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "실험 생성",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
    {
      id: "el-2",
      experimentId: "exp-1",
      actionType: "start",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "실험 시작",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    },
  ];
}

function defaultUserFeedAssignments(): UserFeedAssignment[] {
  return [
    {
      id: "ufa-1",
      userId: "me",
      experimentId: "exp-1",
      assignedVersionId: "fv-variant-a-home",
      assignedGroup: "variant_a",
      assignedAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
      region: "마닐라",
      memberType: "normal",
    },
    {
      id: "ufa-2",
      userId: "user2",
      experimentId: "exp-1",
      assignedVersionId: "fv-control-home",
      assignedGroup: "control",
      assignedAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
      region: "마닐라",
      memberType: "premium",
    },
  ];
}

function defaultActiveFeedVersions(): ActiveFeedVersion[] {
  const now = isoNow();
  return (["home", "search", "shop"] as RecommendationSurface[]).map((surface) => ({
    id: `afv-${surface}`,
    surface,
    liveVersionId: "fv-control-home",
    previousVersionId: null,
    rolloutPercent: 100,
    updatedAt: now,
    updatedByAdminId: ADMIN_ID,
    updatedByAdminNickname: ADMIN_NICKNAME,
  }));
}

function defaultDeployments(): RecommendationDeployment[] {
  const now = isoNow();
  return [
    {
      id: "rd-1",
      surface: "home",
      deploymentName: "홈 기본 버전 배포",
      sourceExperimentId: null,
      deployedVersionId: "fv-control-home",
      previousVersionId: null,
      deploymentStatus: "success",
      rolloutType: "full",
      rolloutPercent: 100,
      deployedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      scheduledAt: null,
      note: "초기 배포",
      createdAt: now,
      createdByAdminId: ADMIN_ID,
      createdByAdminNickname: ADMIN_NICKNAME,
    },
  ];
}

function defaultDeploymentLogs(): RecommendationDeploymentLog[] {
  return [
    {
      id: "rdl-1",
      deploymentId: "rd-1",
      actionType: "deploy",
      actorType: "admin",
      actorId: ADMIN_ID,
      actorNickname: ADMIN_NICKNAME,
      note: "홈 기본 버전 배포",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    },
  ];
}

function defaultRollbackPolicies(): RecommendationRollbackPolicy[] {
  const now = isoNow();
  return (["home", "search", "shop"] as RecommendationSurface[]).map((surface) => ({
    id: `rrp-${surface}`,
    surface,
    autoRollbackEnabled: false,
    minCtrThreshold: 0.01,
    minConversionRateThreshold: 0.05,
    maxErrorRateThreshold: 0.1,
    compareWindowHours: 24,
    updatedAt: now,
    adminMemo: "placeholder",
  }));
}

const FEED_VERSIONS: FeedVersion[] = defaultFeedVersions();
const EXPERIMENTS: RecommendationExperiment[] = defaultExperiments();
const EXPERIMENT_LOGS: ExperimentLog[] = defaultExperimentLogs();
const USER_FEED_ASSIGNMENTS: UserFeedAssignment[] = defaultUserFeedAssignments();
const ACTIVE_FEED_VERSIONS: ActiveFeedVersion[] = defaultActiveFeedVersions();
const DEPLOYMENTS: RecommendationDeployment[] = defaultDeployments();
const DEPLOYMENT_LOGS: RecommendationDeploymentLog[] = defaultDeploymentLogs();
const ROLLBACK_POLICIES: RecommendationRollbackPolicy[] = defaultRollbackPolicies();
const EXPERIMENT_WINNER_SUMMARIES: ExperimentWinnerSummary[] = [];

export type RecommendationExperimentsBundleV1 = {
  version: 1;
  feedVersions: FeedVersion[];
  experiments: RecommendationExperiment[];
  experimentLogs: ExperimentLog[];
  userFeedAssignments: UserFeedAssignment[];
  activeFeedVersions: ActiveFeedVersion[];
  deployments: RecommendationDeployment[];
  deploymentLogs: RecommendationDeploymentLog[];
  rollbackPolicies: RecommendationRollbackPolicy[];
  experimentWinnerSummaries: ExperimentWinnerSummary[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

function trimLogs<T>(logs: T[], max: number) {
  if (logs.length > max) logs.length = max;
}

export function createDefaultRecommendationExperimentsBundle(): RecommendationExperimentsBundleV1 {
  return {
    version: 1,
    feedVersions: defaultFeedVersions().map((v) => ({ ...v })),
    experiments: defaultExperiments().map((e) => ({ ...e })),
    experimentLogs: defaultExperimentLogs().map((l) => ({ ...l })),
    userFeedAssignments: defaultUserFeedAssignments().map((a) => ({ ...a })),
    activeFeedVersions: defaultActiveFeedVersions().map((a) => ({ ...a })),
    deployments: defaultDeployments().map((d) => ({ ...d })),
    deploymentLogs: defaultDeploymentLogs().map((l) => ({ ...l })),
    rollbackPolicies: defaultRollbackPolicies().map((p) => ({ ...p })),
    experimentWinnerSummaries: [],
  };
}

export function importRecommendationExperimentsBundle(
  bundle: RecommendationExperimentsBundleV1
): void {
  if (bundle.version !== 1) return;
  replaceArray(FEED_VERSIONS, (bundle.feedVersions ?? []).map((v) => ({ ...v })));
  replaceArray(EXPERIMENTS, (bundle.experiments ?? []).map((e) => ({ ...e })));
  replaceArray(
    EXPERIMENT_LOGS,
    (bundle.experimentLogs ?? []).map((l) => ({ ...l })).slice(0, MAX_LOGS)
  );
  replaceArray(
    USER_FEED_ASSIGNMENTS,
    (bundle.userFeedAssignments ?? []).map((a) => ({ ...a }))
  );
  replaceArray(
    ACTIVE_FEED_VERSIONS,
    (bundle.activeFeedVersions ?? []).map((a) => ({ ...a }))
  );
  replaceArray(DEPLOYMENTS, (bundle.deployments ?? []).map((d) => ({ ...d })));
  replaceArray(
    DEPLOYMENT_LOGS,
    (bundle.deploymentLogs ?? []).map((l) => ({ ...l })).slice(0, MAX_LOGS)
  );
  replaceArray(
    ROLLBACK_POLICIES,
    (bundle.rollbackPolicies ?? []).map((p) => ({ ...p }))
  );
  replaceArray(
    EXPERIMENT_WINNER_SUMMARIES,
    (bundle.experimentWinnerSummaries ?? []).map((s) => ({ ...s }))
  );
  if (!FEED_VERSIONS.length) replaceArray(FEED_VERSIONS, defaultFeedVersions());
  if (!EXPERIMENTS.length) replaceArray(EXPERIMENTS, defaultExperiments());
  if (!ACTIVE_FEED_VERSIONS.length)
    replaceArray(ACTIVE_FEED_VERSIONS, defaultActiveFeedVersions());
  if (!ROLLBACK_POLICIES.length)
    replaceArray(ROLLBACK_POLICIES, defaultRollbackPolicies());
}

export function exportRecommendationExperimentsBundle(): RecommendationExperimentsBundleV1 {
  return {
    version: 1,
    feedVersions: FEED_VERSIONS.map((v) => ({ ...v })),
    experiments: EXPERIMENTS.map((e) => ({ ...e })),
    experimentLogs: EXPERIMENT_LOGS.map((l) => ({ ...l })),
    userFeedAssignments: USER_FEED_ASSIGNMENTS.map((a) => ({ ...a })),
    activeFeedVersions: ACTIVE_FEED_VERSIONS.map((a) => ({ ...a })),
    deployments: DEPLOYMENTS.map((d) => ({ ...d })),
    deploymentLogs: DEPLOYMENT_LOGS.map((l) => ({ ...l })),
    rollbackPolicies: ROLLBACK_POLICIES.map((p) => ({ ...p })),
    experimentWinnerSummaries: EXPERIMENT_WINNER_SUMMARIES.map((s) => ({ ...s })),
  };
}

/* ─── feed versions ─────────────────────────────────────────── */

export function getFeedVersions(surface?: "home" | "search" | "shop"): FeedVersion[] {
  if (surface) return FEED_VERSIONS.filter((v) => v.surface === surface);
  return [...FEED_VERSIONS];
}

export function getFeedVersionById(id: string): FeedVersion | undefined {
  return FEED_VERSIONS.find((v) => v.id === id);
}

export function saveFeedVersion(
  input: Omit<FeedVersion, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  }
): FeedVersion {
  const now = isoNow();
  const existing = FEED_VERSIONS.find((v) => v.id === input.id);
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const version: FeedVersion = { ...input, createdAt: now, updatedAt: now };
  FEED_VERSIONS.push(version);
  return { ...version };
}

/* ─── experiments ───────────────────────────────────────────── */

export function getRecommendationExperiments(): RecommendationExperiment[] {
  return [...EXPERIMENTS];
}

export function getRunningExperiments(): RecommendationExperiment[] {
  return EXPERIMENTS.filter((e) => e.status === "running");
}

export function getRecommendationExperimentById(
  id: string
): RecommendationExperiment | undefined {
  return EXPERIMENTS.find((e) => e.id === id);
}

export function saveRecommendationExperiment(
  input: Omit<RecommendationExperiment, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  }
): RecommendationExperiment {
  const now = isoNow();
  const existing = EXPERIMENTS.find((e) => e.id === input.id);
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const exp: RecommendationExperiment = { ...input, createdAt: now, updatedAt: now };
  EXPERIMENTS.push(exp);
  return { ...exp };
}

export function setExperimentStatus(
  id: string,
  status: ExperimentStatus
): RecommendationExperiment | undefined {
  const e = EXPERIMENTS.find((x) => x.id === id);
  if (!e) return undefined;
  e.status = status;
  e.updatedAt = isoNow();
  if (status === "running") e.startAt = e.startAt || isoNow();
  if (status === "ended") e.endAt = isoNow();
  return { ...e };
}

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  draft: "초안",
  running: "진행중",
  paused: "일시중지",
  ended: "종료",
};

export const TRAFFIC_ALLOCATION_LABELS: Record<
  RecommendationExperiment["trafficAllocationType"],
  string
> = {
  percentage: "비율",
  region_based: "지역 기준",
  member_type_based: "회원유형 기준",
};

/* ─── experiment logs ───────────────────────────────────────── */

export function getExperimentLogs(experimentId?: string): ExperimentLog[] {
  let list = [...EXPERIMENT_LOGS];
  if (experimentId) list = list.filter((l) => l.experimentId === experimentId);
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addExperimentLog(
  experimentId: string,
  actionType: ExperimentLogActionType,
  note: string,
  actorType: "admin" | "system" = "admin",
  actorId = ADMIN_ID,
  actorNickname = ADMIN_NICKNAME
): ExperimentLog {
  const log: ExperimentLog = {
    id: `el-${Date.now()}`,
    experimentId,
    actionType,
    actorType,
    actorId,
    actorNickname,
    note,
    createdAt: isoNow(),
  };
  EXPERIMENT_LOGS.unshift(log);
  trimLogs(EXPERIMENT_LOGS, MAX_LOGS);
  return log;
}

/* ─── user feed assignments ─────────────────────────────────── */

export function getUserFeedAssignments(filters?: {
  userId?: string;
  experimentId?: string;
  versionId?: string;
}): UserFeedAssignment[] {
  let list = [...USER_FEED_ASSIGNMENTS];
  if (filters?.userId) list = list.filter((a) => a.userId === filters.userId);
  if (filters?.experimentId)
    list = list.filter((a) => a.experimentId === filters.experimentId);
  if (filters?.versionId)
    list = list.filter((a) => a.assignedVersionId === filters.versionId);
  return list;
}

export function getAssignedVersionId(
  userId: string,
  surface: "home" | "search" | "shop",
  context?: { region?: string; memberType?: string }
): string | null {
  const experiments = getRunningExperiments().filter((e) => e.targetSurface === surface);
  for (const exp of experiments) {
    const existing = USER_FEED_ASSIGNMENTS.find(
      (a) => a.userId === userId && a.experimentId === exp.id
    );
    if (existing) return existing.assignedVersionId;
    const assigned = assignUserToExperiment(userId, exp, context);
    if (assigned) return assigned.assignedVersionId;
  }
  return null;
}

export function assignUserToExperiment(
  userId: string,
  experiment: RecommendationExperiment,
  context?: { region?: string; memberType?: string }
): UserFeedAssignment | null {
  if (experiment.status !== "running") return null;
  const existing = USER_FEED_ASSIGNMENTS.find(
    (a) => a.userId === userId && a.experimentId === experiment.id
  );
  if (existing) return existing;

  const region = context?.region ?? "";
  const memberType = context?.memberType ?? "normal";
  if (experiment.targetRegions.length && !experiment.targetRegions.includes(region))
    return null;
  if (
    experiment.targetMemberTypes.length &&
    !experiment.targetMemberTypes.includes(memberType)
  )
    return null;

  const rand = Math.random() * 100;
  const controlPct = experiment.controlPercentage;
  const variants = experiment.variantVersionIds;
  const variantPcts = experiment.variantPercentages;
  let cum = controlPct;
  if (rand < cum) {
    const a: UserFeedAssignment = {
      id: `ufa-${Date.now()}-${userId}`,
      userId,
      experimentId: experiment.id,
      assignedVersionId: experiment.controlVersionId,
      assignedGroup: "control",
      assignedAt: isoNow(),
      region,
      memberType,
    };
    USER_FEED_ASSIGNMENTS.push(a);
    return a;
  }
  for (let i = 0; i < variants.length; i++) {
    cum += variantPcts[i] ?? 0;
    if (rand < cum) {
      const group: AssignedGroup =
        i === 0 ? "variant_a" : i === 1 ? "variant_b" : "variant_b";
      const a: UserFeedAssignment = {
        id: `ufa-${Date.now()}-${userId}`,
        userId,
        experimentId: experiment.id,
        assignedVersionId: variants[i]!,
        assignedGroup: group,
        assignedAt: isoNow(),
        region,
        memberType,
      };
      USER_FEED_ASSIGNMENTS.push(a);
      return a;
    }
  }
  const a: UserFeedAssignment = {
    id: `ufa-${Date.now()}-${userId}`,
    userId,
    experimentId: experiment.id,
    assignedVersionId: experiment.controlVersionId,
    assignedGroup: "control",
    assignedAt: isoNow(),
    region,
    memberType,
  };
  USER_FEED_ASSIGNMENTS.push(a);
  return a;
}

/* ─── active feed versions ──────────────────────────────────── */

export function getActiveFeedVersions(): ActiveFeedVersion[] {
  return [...ACTIVE_FEED_VERSIONS];
}

export function getActiveFeedVersionBySurface(
  surface: RecommendationSurface
): ActiveFeedVersion | undefined {
  return ACTIVE_FEED_VERSIONS.find((a) => a.surface === surface);
}

export function getLiveVersionId(surface: RecommendationSurface): string | null {
  const a = ACTIVE_FEED_VERSIONS.find((x) => x.surface === surface);
  return a?.liveVersionId ?? null;
}

export function setLiveVersion(
  surface: RecommendationSurface,
  versionId: string,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICKNAME
): ActiveFeedVersion {
  const now = isoNow();
  const row = ACTIVE_FEED_VERSIONS.find((a) => a.surface === surface);
  if (row) {
    row.previousVersionId = row.liveVersionId;
    row.liveVersionId = versionId;
    row.rolloutPercent = 100;
    row.updatedAt = now;
    row.updatedByAdminId = adminId;
    row.updatedByAdminNickname = adminNickname;
    return { ...row };
  }
  const newRow: ActiveFeedVersion = {
    id: `afv-${surface}-${Date.now()}`,
    surface,
    liveVersionId: versionId,
    previousVersionId: null,
    rolloutPercent: 100,
    updatedAt: now,
    updatedByAdminId: adminId,
    updatedByAdminNickname: adminNickname,
  };
  ACTIVE_FEED_VERSIONS.push(newRow);
  return { ...newRow };
}

export function rollbackToPrevious(
  surface: RecommendationSurface,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICKNAME
): ActiveFeedVersion | null {
  const row = ACTIVE_FEED_VERSIONS.find((a) => a.surface === surface);
  if (!row?.previousVersionId) return null;
  const now = isoNow();
  row.liveVersionId = row.previousVersionId;
  row.previousVersionId = null;
  row.updatedAt = now;
  row.updatedByAdminId = adminId;
  row.updatedByAdminNickname = adminNickname;
  return { ...row };
}

/* ─── deployments ───────────────────────────────────────────── */

export function getRecommendationDeployments(filters?: {
  surface?: RecommendationSurface;
  status?: DeploymentStatus;
}): RecommendationDeployment[] {
  let list = [...DEPLOYMENTS];
  if (filters?.surface) list = list.filter((d) => d.surface === filters.surface);
  if (filters?.status) list = list.filter((d) => d.deploymentStatus === filters.status);
  return list.sort(
    (a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime()
  );
}

export function getRecommendationDeploymentById(
  id: string
): RecommendationDeployment | undefined {
  return DEPLOYMENTS.find((d) => d.id === id);
}

export function addRecommendationDeployment(
  input: Omit<RecommendationDeployment, "id">
): RecommendationDeployment {
  const d: RecommendationDeployment = {
    ...input,
    id: `rd-${Date.now()}`,
  };
  DEPLOYMENTS.unshift(d);
  return { ...d };
}

export function setDeploymentStatus(
  id: string,
  status: DeploymentStatus
): RecommendationDeployment | undefined {
  const d = DEPLOYMENTS.find((x) => x.id === id);
  if (!d) return undefined;
  d.deploymentStatus = status;
  return { ...d };
}

/* ─── deployment logs ───────────────────────────────────────── */

export function getRecommendationDeploymentLogs(
  deploymentId?: string
): RecommendationDeploymentLog[] {
  let list = [...DEPLOYMENT_LOGS];
  if (deploymentId) list = list.filter((l) => l.deploymentId === deploymentId);
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addRecommendationDeploymentLog(
  deploymentId: string,
  actionType: DeploymentLogActionType,
  note: string,
  actorType: "admin" | "system" = "admin",
  actorId = ADMIN_ID,
  actorNickname = ADMIN_NICKNAME
): RecommendationDeploymentLog {
  const log: RecommendationDeploymentLog = {
    id: `rdl-${Date.now()}`,
    deploymentId,
    actionType,
    actorType,
    actorId,
    actorNickname,
    note,
    createdAt: isoNow(),
  };
  DEPLOYMENT_LOGS.unshift(log);
  trimLogs(DEPLOYMENT_LOGS, MAX_LOGS);
  return log;
}

/* ─── rollback policies ─────────────────────────────────────── */

export function getRollbackPolicies(
  surface?: RecommendationSurface
): RecommendationRollbackPolicy[] {
  if (surface) return ROLLBACK_POLICIES.filter((p) => p.surface === surface);
  return [...ROLLBACK_POLICIES];
}

export function getRollbackPolicyBySurface(
  surface: RecommendationSurface
): RecommendationRollbackPolicy | undefined {
  return ROLLBACK_POLICIES.find((p) => p.surface === surface);
}

export function saveRollbackPolicy(
  input: Partial<RecommendationRollbackPolicy> & {
    id: string;
    surface: RecommendationSurface;
  }
): RecommendationRollbackPolicy {
  const now = isoNow();
  const existing = ROLLBACK_POLICIES.find(
    (p) => p.id === input.id || p.surface === input.surface
  );
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const policy: RecommendationRollbackPolicy = {
    id: input.id,
    surface: input.surface,
    autoRollbackEnabled: input.autoRollbackEnabled ?? false,
    minCtrThreshold: input.minCtrThreshold ?? 0,
    minConversionRateThreshold: input.minConversionRateThreshold ?? 0,
    maxErrorRateThreshold: input.maxErrorRateThreshold ?? 0,
    compareWindowHours: input.compareWindowHours ?? 24,
    updatedAt: now,
    adminMemo: input.adminMemo ?? "",
  };
  ROLLBACK_POLICIES.push(policy);
  return policy;
}

/* ─── experiment winner summaries ───────────────────────────── */

export function getExperimentWinnerSummaries(
  experimentId?: string
): ExperimentWinnerSummary[] {
  let list = [...EXPERIMENT_WINNER_SUMMARIES];
  if (experimentId) list = list.filter((s) => s.experimentId === experimentId);
  return list.sort(
    (a, b) => new Date(b.comparedAt).getTime() - new Date(a.comparedAt).getTime()
  );
}

export function getExperimentWinnerSummary(
  experimentId: string
): ExperimentWinnerSummary | undefined {
  return EXPERIMENT_WINNER_SUMMARIES.find((s) => s.experimentId === experimentId);
}

function groupFromVersionId(
  exp: { controlVersionId: string; variantVersionIds: string[] },
  versionId: string
): WinningGroup {
  if (versionId === exp.controlVersionId) return "control";
  if (exp.variantVersionIds[0] === versionId) return "variant_a";
  return "variant_b";
}

export function chooseWinner(
  experimentId: string,
  winningMetric: WinningMetric,
  _adminId = ADMIN_ID,
  _adminNickname = ADMIN_NICKNAME
): ExperimentWinnerSummary | null {
  const experiment = getRecommendationExperimentById(experimentId);
  if (!experiment || experiment.status !== "ended") return null;

  const metrics = getExperimentMetrics(experimentId);
  if (metrics.length === 0) return null;

  let best = metrics[0]!;
  let value = 0;
  for (const m of metrics) {
    const v =
      winningMetric === "ctr"
        ? m.ctr
        : winningMetric === "conversion_rate"
          ? m.conversionRate
          : m.ctr * 0.4 + m.conversionRate * 0.6;
    if (v > value) {
      value = v;
      best = m;
    }
  }
  if (winningMetric === "composite_score" && best) {
    value = best.ctr * 0.4 + best.conversionRate * 0.6;
  } else if (best) {
    value = winningMetric === "ctr" ? best.ctr : best.conversionRate;
  }

  const existingIdx = EXPERIMENT_WINNER_SUMMARIES.findIndex(
    (s) => s.experimentId === experimentId
  );
  if (existingIdx >= 0) EXPERIMENT_WINNER_SUMMARIES.splice(existingIdx, 1);

  const summary: ExperimentWinnerSummary = {
    experimentId,
    winningVersionId: best.versionId,
    winningGroup: groupFromVersionId(experiment, best.versionId),
    winningMetric,
    winningValue: Math.round(value * 10000) / 10000,
    comparedAt: isoNow(),
    autoDeployRecommended: value > 0.1,
  };
  EXPERIMENT_WINNER_SUMMARIES.unshift(summary);
  return summary;
}
