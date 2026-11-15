/**
 * Member trust/profile display surface (home CREW REP row ↔ `/mypage/trust`).
 * Authority: snapshot score via `resolveMemberTrustDisplayScore`
 * (prefer `manner_battery_percent` / snapshot bridge `trust_score`).
 * Display SSOT: `lib/trust/crew-rep.ts` (`82 / 100` · 6 tiers · no `%`).
 * DO NOT: invent a second score; twin numbers in Member UI.
 */

import { buildCrewRepView, type CrewRepView } from "@/lib/trust/crew-rep";
import { resolveMemberTrustDisplayScore } from "@/lib/trust/trust-score-ssot";

export type MemberTrustSurfaceInput = {
  manner_battery_percent?: number | null;
  trust_score?: number | null;
  manner_score?: number | null;
  temperature?: number | null;
};

export type MemberTrustSurface = {
  /** Authority score 0–100 (same field Admin shows, up to 2 decimals). */
  rawScore: number;
  /** CREW REP display view — integer score, tier, color, tier label key. */
  view: CrewRepView;
};

export function buildMemberTrustSurface(input: MemberTrustSurfaceInput): MemberTrustSurface {
  const rawScore =
    input.manner_battery_percent != null && Number.isFinite(Number(input.manner_battery_percent))
      ? resolveMemberTrustDisplayScore({
          trust_score: Number(input.manner_battery_percent),
        })
      : resolveMemberTrustDisplayScore(input);
  return { rawScore, view: buildCrewRepView(rawScore) };
}
