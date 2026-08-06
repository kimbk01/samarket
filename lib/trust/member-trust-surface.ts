/**
 * Slice 4 — Member trust/profile display surface (home manner row ↔ `/mypage/trust`).
 * Authority: `profiles.trust_score` via `resolveMemberTrustDisplayScore` (Slice 1 SSOT).
 * DO NOT: invent a second score; show session temperature alone when DB trust exists.
 * DO NOT: render both scoreLabel and percentLabel as twin numbers in Member UI —
 * one text SSOT (`scoreLabel`) + MannerBatteryIcon visual fill only.
 */

import {
  mannerBatteryAccentClass,
  mannerBatteryTier,
  mannerRawToPercent,
  type MannerBatteryTier,
} from "@/lib/trust/manner-battery";
import { resolveMemberTrustDisplayScore } from "@/lib/trust/trust-score-ssot";

export type MemberTrustSurfaceInput = {
  trust_score?: number | null;
  manner_score?: number | null;
  temperature?: number | null;
};

export type MemberTrustSurface = {
  /** Authority trust score 0–100 (same field Admin shows). */
  score: number;
  /** Battery UI percent derived from score. */
  percent: number;
  tier: MannerBatteryTier;
  accentClass: string;
  /** Compact label for list rows (matches Admin numeric authority). */
  scoreLabel: string;
  /** Hero label on trust detail (`NN%`). */
  percentLabel: string;
};

export function formatMemberTrustScoreLabel(score: number): string {
  return score.toFixed(score % 1 === 0 ? 0 : 2);
}

export function buildMemberTrustSurface(input: MemberTrustSurfaceInput): MemberTrustSurface {
  const score = resolveMemberTrustDisplayScore(input);
  const percent = mannerRawToPercent(score);
  const tier = mannerBatteryTier(percent);
  return {
    score,
    percent,
    tier,
    accentClass: mannerBatteryAccentClass(tier),
    scoreLabel: formatMemberTrustScoreLabel(score),
    percentLabel: `${percent}%`,
  };
}
