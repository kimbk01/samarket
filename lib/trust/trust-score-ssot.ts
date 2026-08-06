/**
 * Slice 1 — Trust SSOT helpers (User Facts)
 * Runtime Authority = profiles.trust_score
 * Member temperature / Admin detail are projections only.
 */

import { TRUST_SCORE_DEFAULT, clampTrustScore } from "@/lib/trust/trust-score-core";

/** Prefer DB trust_score; legacy manner_score only if trust missing. */
export function resolveTrustScoreAuthority(input: {
  trust_score?: number | null;
  manner_score?: number | null;
}): number {
  const ts = input.trust_score;
  if (ts != null && Number.isFinite(Number(ts))) return clampTrustScore(Number(ts));
  const ms = input.manner_score;
  if (ms != null && Number.isFinite(Number(ms))) return clampTrustScore(Number(ms));
  return TRUST_SCORE_DEFAULT;
}

/**
 * Session `temperature` must equal authority projection.
 * If session disagrees with trust_score, trust_score wins.
 */
export function resolveMemberTrustDisplayScore(input: {
  trust_score?: number | null;
  manner_score?: number | null;
  temperature?: number | null;
}): number {
  const authority = resolveTrustScoreAuthority(input);
  if (input.trust_score != null && Number.isFinite(Number(input.trust_score))) {
    return authority;
  }
  // No DB trust yet: allow temperature only as interim projection of legacy path
  if (input.temperature != null && Number.isFinite(Number(input.temperature))) {
    return clampTrustScore(Number(input.temperature));
  }
  return authority;
}
