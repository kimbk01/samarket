/**
 * Member trust/profile display surface (home manner row ↔ `/mypage/trust`).
 * Authority: Manner Battery % via `resolveMemberTrustDisplayScore`
 * (prefer `manner_battery_percent` / snapshot bridge `trust_score`).
 * DO NOT: invent a second score; twin numbers in Member UI.
 */

import {
  mannerBatteryAccentClass,
  mannerBatteryTier,
  mannerRawToPercent,
  type MannerBatteryTier,
} from "@/lib/trust/manner-battery";
import { resolveMemberTrustDisplayScore } from "@/lib/trust/trust-score-ssot";

export type MemberTrustSurfaceInput = {
  manner_battery_percent?: number | null;
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
  /** Compact numeric label (matches Admin numeric authority; no `%`). */
  scoreLabel: string;
  /** Member UI single display (`NN%` / `NN.NN%`) — use this in home/trust, not twin labels. */
  percentLabel: string;
};

export function formatMemberTrustScoreLabel(score: number): string {
  return score.toFixed(score % 1 === 0 ? 0 : 2);
}

/** Member-facing single score text with `%` (authority score, not a second twin number). */
export function formatMemberTrustDisplayWithPercent(score: number): string {
  return `${formatMemberTrustScoreLabel(score)}%`;
}

export function buildMemberTrustSurface(input: MemberTrustSurfaceInput): MemberTrustSurface {
  const score =
    input.manner_battery_percent != null && Number.isFinite(Number(input.manner_battery_percent))
      ? resolveMemberTrustDisplayScore({
          trust_score: Number(input.manner_battery_percent),
        })
      : resolveMemberTrustDisplayScore(input);
  const percent = mannerRawToPercent(score);
  const tier = mannerBatteryTier(percent);
  return {
    score,
    percent,
    tier,
    accentClass: mannerBatteryAccentClass(tier),
    scoreLabel: formatMemberTrustScoreLabel(score),
    percentLabel: formatMemberTrustDisplayWithPercent(score),
  };
}
