/**
 * 36단계: recovery(복귀) 상태 mock
 */

import type { RecommendationRecoveryState, RecoveryModeState } from "@/lib/types/recommendation-automation";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getFeedMode } from "@/lib/feed-emergency/feed-emergency-utils";

const now = new Date().toISOString();

function buildRecoveryState(surface: RecommendationSurface): RecommendationRecoveryState {
  const mode = getFeedMode(surface);
  const currentMode: RecoveryModeState =
    mode === "kill_switch" ? "kill_switch" : mode === "fallback" ? "fallback" : "normal";
  const recoveryEligible =
    currentMode !== "normal" &&
    currentMode !== "kill_switch";
  return {
    id: `rrs-${surface}`,
    surface,
    currentMode,
    recoveryEligible,
    recoveryReason: recoveryEligible
      ? "fallback 해제 후보 (healthy 유지 시 자동 복귀)"
      : "",
    checkedAt: now,
    updatedAt: now,
  };
}

export function getRecommendationRecoveryStates(
  surface?: RecommendationSurface
): RecommendationRecoveryState[] {
  const surfaces: RecommendationSurface[] = surface
    ? [surface]
    : ["home", "search", "shop"];
  return surfaces.map(buildRecoveryState);
}

export function getRecommendationRecoveryStateBySurface(
  surface: RecommendationSurface
): RecommendationRecoveryState {
  return buildRecoveryState(surface);
}
