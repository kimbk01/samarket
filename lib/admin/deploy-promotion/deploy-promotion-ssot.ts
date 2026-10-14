/**
 * Admin Web SHA promotion SSOT (1st scope = Web only).
 * DB / Android / iOS production rollout remain separate Owner approvals.
 */

export const DEPLOY_PROMOTE_LAYERS = ["web", "db", "android", "ios"] as const;
export type DeployPromoteLayer = (typeof DEPLOY_PROMOTE_LAYERS)[number];

/** Layers allowed without a new Owner approval beyond the 2026-10-14 policy. */
export const DEPLOY_PROMOTE_LAYERS_PHASE1: readonly DeployPromoteLayer[] = ["web"];

export type DeployPromotionStatus =
  | "unverified"
  | "verified"
  | "promoting"
  | "success"
  | "failed"
  | "rolled_back";

export type DeployPromotionRecord = {
  sha: string;
  status: DeployPromotionStatus;
  layers: DeployPromoteLayer[];
  verifiedBy?: string;
  verifiedAt?: string;
  promotedBy?: string;
  promotedAt?: string;
  error?: string;
  githubResult?: string;
};

export function isShaFormat(sha: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(sha.trim());
}

export function assertPhase1Layers(layers: DeployPromoteLayer[]): {
  ok: true;
  layers: DeployPromoteLayer[];
} | { ok: false; error: string } {
  const unique = [...new Set(layers)];
  for (const layer of unique) {
    if (!DEPLOY_PROMOTE_LAYERS_PHASE1.includes(layer)) {
      return {
        ok: false,
        error: `layer_not_in_phase1:${layer}`,
      };
    }
  }
  if (unique.length === 0) {
    return { ok: false, error: "layers_required" };
  }
  return { ok: true, layers: unique };
}

export function readRuntimeGitSha(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.VERCEL_GIT_COMMIT_SHA,
    env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    env.DIBAY_BUILD_SHA,
    env.GITHUB_SHA,
  ];
  for (const c of candidates) {
    const v = (c ?? "").trim();
    if (isShaFormat(v)) return v.toLowerCase();
  }
  return null;
}
