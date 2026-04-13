/**
 * 피드 장애 대응 — 단일 가변 상태 (관리자 UI + 유틸).
 * 영속화는 `feed-emergency-db` + `/api/admin/feed-emergency` 가 담당.
 */
import type {
  FeedEmergencyActionType,
  FeedEmergencyLog,
  FeedEmergencyPolicy,
  FeedFallbackState,
  FeedFallbackModeState,
  FeedSectionOverride,
  FeedSectionOverrideKey,
} from "@/lib/types/feed-emergency";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getActiveFeedVersionBySurface } from "@/lib/recommendation-deployments/mock-active-feed-versions";

const ADMIN_ID = "admin1";
const ADMIN_NICK = "관리자";

export const SECTION_OVERRIDE_KEYS: FeedSectionOverrideKey[] = [
  "recommended",
  "local_latest",
  "bumped",
  "sponsored",
  "premium_shops",
  "recent_based",
  "category_based",
  "interest_based",
];

export const SECTION_OVERRIDE_LABELS: Record<FeedSectionOverrideKey, string> = {
  recommended: "추천",
  local_latest: "우리동네 최신",
  bumped: "끌올",
  sponsored: "광고/프로모션",
  premium_shops: "특별회원/상점",
  recent_based: "최근 본 기반",
  category_based: "카테고리 기반",
  interest_based: "관심 기반",
};

const ACTION_LABELS: Record<FeedEmergencyActionType, string> = {
  enable_kill_switch: "킬스위치 활성화",
  disable_kill_switch: "킬스위치 해제",
  enable_fallback: "Fallback 활성화",
  disable_fallback: "Fallback 해제",
  disable_section: "섹션 비활성화",
  enable_section: "섹션 활성화",
  auto_fallback: "자동 Fallback",
  rollback_to_previous: "이전 버전 롤백",
};

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

function isoNow() {
  return new Date().toISOString();
}

function defaultPolicies(): FeedEmergencyPolicy[] {
  const t = isoNow();
  return SURFACES.map((surface) => ({
    id: `fep-${surface}`,
    surface,
    killSwitchEnabled: false,
    fallbackEnabled: true,
    fallbackMode: "previous_live_version" as const,
    autoDisableEnabled: false,
    errorRateThreshold: 0.05,
    emptyFeedThreshold: 3,
    ctrDropThreshold: 0.3,
    emergencyNoticeEnabled: false,
    emergencyNoticeText: "일시적인 점검 중입니다. 잠시만 기다려 주세요.",
    updatedAt: t,
    adminMemo: "",
  }));
}

function defaultFallbackStates(): FeedFallbackState[] {
  const t = isoNow();
  return SURFACES.map((surface) => ({
    id: `ffs-${surface}`,
    surface,
    currentMode: "normal" as FeedFallbackModeState,
    activeVersionId: null,
    fallbackVersionId: null,
    fallbackReason: "",
    startedAt: t,
    updatedAt: t,
  }));
}

export type FeedEmergencyBundleV1 = {
  version: 1;
  policies: FeedEmergencyPolicy[];
  fallbackStates: FeedFallbackState[];
  sectionOverrides: FeedSectionOverride[];
  logs: FeedEmergencyLog[];
};

const POLICIES: FeedEmergencyPolicy[] = defaultPolicies();
const STATES: FeedFallbackState[] = defaultFallbackStates();
const OVERRIDES: FeedSectionOverride[] = [];
const LOGS: FeedEmergencyLog[] = [];

const MAX_LOGS = 200;

export function createDefaultFeedEmergencyBundle(): FeedEmergencyBundleV1 {
  return {
    version: 1,
    policies: defaultPolicies().map((p) => ({ ...p })),
    fallbackStates: defaultFallbackStates().map((s) => ({ ...s })),
    sectionOverrides: [],
    logs: [],
  };
}

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

/** 서버에서 로드한 번들로 메모리 상태 교체 (관리자 클라이언트 hydration) */
export function importFeedEmergencyBundle(bundle: FeedEmergencyBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(POLICIES, (bundle.policies ?? []).map((p) => ({ ...p })));
  replaceArray(STATES, (bundle.fallbackStates ?? []).map((s) => ({ ...s })));
  replaceArray(OVERRIDES, (bundle.sectionOverrides ?? []).map((o) => ({ ...o })));
  const logs = (bundle.logs ?? []).slice(0, MAX_LOGS);
  replaceArray(LOGS, logs.map((l) => ({ ...l })));
  if (!POLICIES.length) replaceArray(POLICIES, defaultPolicies());
  if (!STATES.length) replaceArray(STATES, defaultFallbackStates());
}

export function exportFeedEmergencyBundle(): FeedEmergencyBundleV1 {
  return {
    version: 1,
    policies: POLICIES.map((p) => ({ ...p })),
    fallbackStates: STATES.map((s) => ({ ...s })),
    sectionOverrides: OVERRIDES.map((o) => ({ ...o })),
    logs: LOGS.map((l) => ({ ...l })),
  };
}

/** DB/공개 API용: 번들만으로 모드·공지 계산 (전역 상태 변경 없음) */
export function computeFeedEmergencyPublicSnapshot(
  bundle: FeedEmergencyBundleV1,
  surface: RecommendationSurface
): {
  mode: FeedFallbackModeState;
  emergencyNotice: { enabled: boolean; text: string };
  disabledSectionKeys: FeedSectionOverrideKey[];
  fallbackVersionId: string | null;
} {
  const policy = bundle.policies.find((p) => p.surface === surface);
  const state = bundle.fallbackStates.find((s) => s.surface === surface);
  if (policy?.killSwitchEnabled) {
    return {
      mode: "kill_switch",
      emergencyNotice: {
        enabled: Boolean(policy.emergencyNoticeEnabled),
        text: policy.emergencyNoticeText || "일시적인 점검 중입니다.",
      },
      disabledSectionKeys: bundle.sectionOverrides
        .filter((o) => o.surface === surface && o.isForcedDisabled)
        .map((o) => o.sectionKey),
      fallbackVersionId: null,
    };
  }
  const mode: FeedFallbackModeState = state?.currentMode ?? "normal";
  const showNotice =
    Boolean(policy?.emergencyNoticeEnabled) && (mode === "kill_switch" || mode === "fallback");
  let fallbackVersionId: string | null = null;
  if (mode === "fallback" || mode === "kill_switch") {
    if (state?.fallbackVersionId) fallbackVersionId = state.fallbackVersionId;
    else if (policy?.fallbackMode === "previous_live_version") {
      const active = getActiveFeedVersionBySurface(surface);
      fallbackVersionId = active?.previousVersionId ?? null;
    }
  }
  return {
    mode,
    emergencyNotice: {
      enabled: showNotice,
      text: policy?.emergencyNoticeText ?? "일시적인 점검 중입니다.",
    },
    disabledSectionKeys: bundle.sectionOverrides
      .filter((o) => o.surface === surface && o.isForcedDisabled)
      .map((o) => o.sectionKey),
    fallbackVersionId,
  };
}

/* ─── policies ───────────────────────────────────────────────── */

export function getFeedEmergencyPolicies(surface?: RecommendationSurface): FeedEmergencyPolicy[] {
  if (surface) return POLICIES.filter((p) => p.surface === surface);
  return [...POLICIES];
}

export function getFeedEmergencyPolicyBySurface(
  surface: RecommendationSurface
): FeedEmergencyPolicy | undefined {
  return POLICIES.find((p) => p.surface === surface);
}

export function saveFeedEmergencyPolicy(
  input: Partial<FeedEmergencyPolicy> & { id: string; surface: RecommendationSurface }
): FeedEmergencyPolicy {
  const now = isoNow();
  const existing = POLICIES.find((p) => p.id === input.id || p.surface === input.surface);
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const policy: FeedEmergencyPolicy = {
    id: input.id,
    surface: input.surface,
    killSwitchEnabled: input.killSwitchEnabled ?? false,
    fallbackEnabled: input.fallbackEnabled ?? false,
    fallbackMode: input.fallbackMode ?? "previous_live_version",
    autoDisableEnabled: input.autoDisableEnabled ?? false,
    errorRateThreshold: input.errorRateThreshold ?? 0,
    emptyFeedThreshold: input.emptyFeedThreshold ?? 0,
    ctrDropThreshold: input.ctrDropThreshold ?? 0,
    emergencyNoticeEnabled: input.emergencyNoticeEnabled ?? false,
    emergencyNoticeText: input.emergencyNoticeText ?? "",
    updatedAt: now,
    adminMemo: input.adminMemo ?? "",
  };
  POLICIES.push(policy);
  return policy;
}

/* ─── fallback states ───────────────────────────────────────── */

export function getFeedFallbackStates(surface?: RecommendationSurface): FeedFallbackState[] {
  if (surface) return STATES.filter((s) => s.surface === surface);
  return STATES.map((s) => ({ ...s }));
}

export function getFeedFallbackStateBySurface(
  surface: RecommendationSurface
): FeedFallbackState | undefined {
  const s = STATES.find((x) => x.surface === surface);
  return s ? { ...s } : undefined;
}

export function setFeedFallbackState(
  surface: RecommendationSurface,
  update: Partial<
    Pick<FeedFallbackState, "currentMode" | "activeVersionId" | "fallbackVersionId" | "fallbackReason">
  >
): FeedFallbackState {
  const now = isoNow();
  const row = STATES.find((s) => s.surface === surface);
  if (!row) {
    const newRow: FeedFallbackState = {
      id: `ffs-${surface}-${Date.now()}`,
      surface,
      currentMode: update.currentMode ?? "normal",
      activeVersionId: update.activeVersionId ?? null,
      fallbackVersionId: update.fallbackVersionId ?? null,
      fallbackReason: update.fallbackReason ?? "",
      startedAt: now,
      updatedAt: now,
    };
    STATES.push(newRow);
    return { ...newRow };
  }
  if (update.currentMode !== undefined) row.currentMode = update.currentMode;
  if (update.activeVersionId !== undefined) row.activeVersionId = update.activeVersionId;
  if (update.fallbackVersionId !== undefined) row.fallbackVersionId = update.fallbackVersionId;
  if (update.fallbackReason !== undefined) row.fallbackReason = update.fallbackReason;
  row.updatedAt = now;
  return { ...row };
}

/* ─── section overrides ─────────────────────────────────────── */

export function getFeedSectionOverrides(surface?: RecommendationSurface): FeedSectionOverride[] {
  if (surface) return OVERRIDES.filter((o) => o.surface === surface);
  return [...OVERRIDES];
}

export function getFeedSectionOverride(
  surface: RecommendationSurface,
  sectionKey: FeedSectionOverrideKey
): FeedSectionOverride | undefined {
  return OVERRIDES.find((o) => o.surface === surface && o.sectionKey === sectionKey);
}

export function setFeedSectionOverride(
  surface: RecommendationSurface,
  sectionKey: FeedSectionOverrideKey,
  isForcedDisabled: boolean,
  reason: string,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
): FeedSectionOverride {
  const now = isoNow();
  const existing = OVERRIDES.find((o) => o.surface === surface && o.sectionKey === sectionKey);
  if (existing) {
    existing.isForcedDisabled = isForcedDisabled;
    existing.reason = reason;
    existing.updatedAt = now;
    existing.updatedByAdminId = adminId;
    existing.updatedByAdminNickname = adminNickname;
    return { ...existing };
  }
  const row: FeedSectionOverride = {
    id: `fso-${surface}-${sectionKey}-${Date.now()}`,
    surface,
    sectionKey,
    isForcedDisabled,
    reason,
    updatedAt: now,
    updatedByAdminId: adminId,
    updatedByAdminNickname: adminNickname,
  };
  OVERRIDES.push(row);
  return row;
}

export function removeFeedSectionOverride(
  surface: RecommendationSurface,
  sectionKey: FeedSectionOverrideKey
): boolean {
  const i = OVERRIDES.findIndex((o) => o.surface === surface && o.sectionKey === sectionKey);
  if (i === -1) return false;
  OVERRIDES.splice(i, 1);
  return true;
}

/* ─── logs ──────────────────────────────────────────────────── */

export function getFeedEmergencyLogs(surface?: RecommendationSurface, limit = 100): FeedEmergencyLog[] {
  let list = [...LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (surface) list = list.filter((l) => l.surface === surface);
  return list.slice(0, limit);
}

export function addFeedEmergencyLog(input: Omit<FeedEmergencyLog, "id" | "createdAt">): FeedEmergencyLog {
  const now = isoNow();
  const log: FeedEmergencyLog = {
    ...input,
    id: `fel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
  };
  LOGS.unshift(log);
  while (LOGS.length > MAX_LOGS) LOGS.pop();
  return log;
}

export function getFeedEmergencyActionLabel(actionType: FeedEmergencyActionType): string {
  return ACTION_LABELS[actionType] ?? actionType;
}
