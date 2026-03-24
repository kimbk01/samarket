/**
 * 34단계: surface별 fallback 상태 mock (normal / fallback / kill_switch)
 */

import type { FeedFallbackState, FeedFallbackModeState } from "@/lib/types/feed-emergency";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const now = new Date().toISOString();

const STATES: FeedFallbackState[] = (
  ["home", "search", "shop"] as RecommendationSurface[]
).map((surface) => ({
  id: `ffs-${surface}`,
  surface,
  currentMode: "normal" as FeedFallbackModeState,
  activeVersionId: null,
  fallbackVersionId: null,
  fallbackReason: "",
  startedAt: now,
  updatedAt: now,
}));

export function getFeedFallbackStates(
  surface?: RecommendationSurface
): FeedFallbackState[] {
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
  update: Partial<Pick<FeedFallbackState, "currentMode" | "activeVersionId" | "fallbackVersionId" | "fallbackReason">>
): FeedFallbackState {
  const now = new Date().toISOString();
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
  if (update.activeVersionId !== undefined)
    row.activeVersionId = update.activeVersionId;
  if (update.fallbackVersionId !== undefined)
    row.fallbackVersionId = update.fallbackVersionId;
  if (update.fallbackReason !== undefined)
    row.fallbackReason = update.fallbackReason;
  row.updatedAt = now;
  return { ...row };
}
