/**
 * Slice 4 — Member trust/profile display surface (home manner row ↔ `/mypage/trust`).
 * Authority: `profiles.trust_score` via `resolveMemberTrustDisplayScore` (Slice 1 SSOT).
 * DO NOT: invent a second score; show session temperature alone when DB trust exists.
 * DO NOT: render twin numbers (e.g. `68.22 · 68%`) in Member UI —
 * one text SSOT (`formatMemberTrustDisplayWithPercent` → `68.22%`) + MannerBatteryIcon visual fill only.
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
  const score = resolveMemberTrustDisplayScore(input);
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
