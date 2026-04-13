/**
 * 34단계: 피드 장애 대응 유틸 — 모드 판별, fallback 버전, 섹션 오버라이드, 긴급 조치
 */

import type { FeedFallbackModeState } from "@/lib/types/feed-emergency";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getActiveFeedVersionBySurface } from "@/lib/recommendation-deployments/mock-active-feed-versions";
import {
  addFeedEmergencyLog,
  getFeedEmergencyPolicyBySurface,
  getFeedFallbackStateBySurface,
  getFeedSectionOverrides,
  saveFeedEmergencyPolicy,
  setFeedFallbackState,
  setFeedSectionOverride,
} from "@/lib/feed-emergency/feed-emergency-state";
import type { FeedSectionOverrideKey } from "@/lib/types/feed-emergency";

const ADMIN_ID = "admin1";
const ADMIN_NICK = "관리자";

/** 피드 빌더용: surface 현재 모드 (normal / fallback / kill_switch) */
export function getFeedMode(surface: RecommendationSurface): FeedFallbackModeState {
  const policy = getFeedEmergencyPolicyBySurface(surface);
  const state = getFeedFallbackStateBySurface(surface);
  if (policy?.killSwitchEnabled) return "kill_switch";
  return state?.currentMode ?? "normal";
}

/** 킬스위치 켜짐 여부 */
export function isKillSwitchEnabled(surface: RecommendationSurface): boolean {
  const policy = getFeedEmergencyPolicyBySurface(surface);
  return policy?.killSwitchEnabled ?? false;
}

/** 해당 surface에서 강제 비활성화된 섹션 키 목록 */
export function getDisabledSectionKeys(surface: RecommendationSurface): FeedSectionOverrideKey[] {
  const overrides = getFeedSectionOverrides(surface);
  return overrides.filter((o) => o.isForcedDisabled).map((o) => o.sectionKey);
}

/** fallback 모드일 때 사용할 버전 ID (previous_live_version이면 33단계 previousVersionId) */
export function getFallbackVersionId(surface: RecommendationSurface): string | null {
  const policy = getFeedEmergencyPolicyBySurface(surface);
  const state = getFeedFallbackStateBySurface(surface);
  if (state?.currentMode !== "fallback" && state?.currentMode !== "kill_switch") return null;
  if (state?.fallbackVersionId) return state.fallbackVersionId;
  if (policy?.fallbackMode === "previous_live_version") {
    const active = getActiveFeedVersionBySurface(surface);
    return active?.previousVersionId ?? null;
  }
  return null;
}

/** 긴급 공지 표시 여부 및 문구 */
export function getEmergencyNotice(surface: RecommendationSurface): {
  enabled: boolean;
  text: string;
} {
  const policy = getFeedEmergencyPolicyBySurface(surface);
  const mode = getFeedMode(surface);
  const show =
    (policy?.emergencyNoticeEnabled ?? false) && (mode === "kill_switch" || mode === "fallback");
  return {
    enabled: show,
    text: policy?.emergencyNoticeText ?? "일시적인 점검 중입니다.",
  };
}

/** 킬스위치 활성화 */
export function enableKillSwitch(
  surface: RecommendationSurface,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
): void {
  const policy = getFeedEmergencyPolicyBySurface(surface);
  if (policy) {
    saveFeedEmergencyPolicy({ ...policy, killSwitchEnabled: true });
    setFeedFallbackState(surface, { currentMode: "kill_switch" });
    addFeedEmergencyLog({
      surface,
      actionType: "enable_kill_switch",
      actorType: "admin",
      actorId: adminId,
      actorNickname: adminNickname,
      sectionKey: null,
      note: "수동 킬스위치 활성화",
    });
  }
}

/** 킬스위치 해제 */
export function disableKillSwitch(
  surface: RecommendationSurface,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
): void {
  const policy = getFeedEmergencyPolicyBySurface(surface);
  if (policy) {
    saveFeedEmergencyPolicy({ ...policy, killSwitchEnabled: false });
    setFeedFallbackState(surface, { currentMode: "normal" });
    addFeedEmergencyLog({
      surface,
      actionType: "disable_kill_switch",
      actorType: "admin",
      actorId: adminId,
      actorNickname: adminNickname,
      sectionKey: null,
      note: "수동 킬스위치 해제",
    });
  }
}

/** Fallback 활성화 (previous_live_version이면 이전 버전 ID 세팅) */
export function enableFallback(
  surface: RecommendationSurface,
  reason: string,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
): void {
  const policy = getFeedEmergencyPolicyBySurface(surface);
  const active = getActiveFeedVersionBySurface(surface);
  let fallbackVersionId: string | null = null;
  if (policy?.fallbackMode === "previous_live_version" && active?.previousVersionId)
    fallbackVersionId = active.previousVersionId;

  setFeedFallbackState(surface, {
    currentMode: "fallback",
    fallbackVersionId,
    fallbackReason: reason,
  });
  addFeedEmergencyLog({
    surface,
    actionType: "enable_fallback",
    actorType: "admin",
    actorId: adminId,
    actorNickname: adminNickname,
    sectionKey: null,
    note: reason,
  });
}

/** Fallback 해제 */
export function disableFallback(
  surface: RecommendationSurface,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
): void {
  setFeedFallbackState(surface, {
    currentMode: "normal",
    fallbackVersionId: null,
    fallbackReason: "",
  });
  addFeedEmergencyLog({
    surface,
    actionType: "disable_fallback",
    actorType: "admin",
    actorId: adminId,
    actorNickname: adminNickname,
    sectionKey: null,
    note: "수동 fallback 해제",
  });
}

/** 섹션 긴급 비활성/활성 토글 */
export function setSectionForcedDisabled(
  surface: RecommendationSurface,
  sectionKey: FeedSectionOverrideKey,
  isForcedDisabled: boolean,
  reason: string,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
): void {
  setFeedSectionOverride(surface, sectionKey, isForcedDisabled, reason, adminId, adminNickname);
  addFeedEmergencyLog({
    surface,
    actionType: isForcedDisabled ? "disable_section" : "enable_section",
    actorType: "admin",
    actorId: adminId,
    actorNickname: adminNickname,
    sectionKey,
    note: reason,
  });
}
