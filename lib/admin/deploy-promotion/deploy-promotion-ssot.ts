/**
 * TEST → Production promote SSOT (Area A extended).
 * Execution of promote/rollback remains blocked until Owner Area B unlock.
 */

export const DEPLOY_PROMOTE_REAUTH_TOKEN = "PROMOTE" as const;

export const DEPLOY_PROMOTE_LAYERS = ["web", "db", "android", "ios"] as const;
export type DeployPromoteLayer = (typeof DEPLOY_PROMOTE_LAYERS)[number];
export type DeployPromotionLayer = DeployPromoteLayer;

/** Layers allowed without a new Owner approval beyond the 2026-10-14 policy. */
export const DEPLOY_PROMOTE_LAYERS_PHASE1: readonly DeployPromoteLayer[] = ["web"];

export type DeployPromotionStatus =
  | "unverified"
  | "pending_verify"
  | "gates_running"
  | "verified"
  | "verify_cancelled"
  | "promote_locked"
  | "promoting"
  | "promoted"
  | "success"
  | "failed"
  | "rolled_back";

/** A/B/C/D pipeline stages — all required for Production success. */
export type DeployPipelineStageId =
  | "A_github_main"
  | "B_vercel_ready"
  | "C_domain_aliased"
  | "D_prod_smoke";

export type DeployPipelineStageState =
  | "idle"
  | "running"
  | "pass"
  | "fail"
  | "skipped_mock";

export type DeployPipelineSnapshot = {
  stages: Record<
    DeployPipelineStageId,
    {
      state: DeployPipelineStageState;
      detail?: string;
      at?: string;
    }
  >;
  /** True only when A+B+C+D all pass (real or mock). */
  allPass: boolean;
  mode: "idle" | "mock_test" | "production";
};

export type DeployPromotionRecord = {
  sha: string;
  layers: DeployPromoteLayer[];
  status: DeployPromotionStatus;
  impactScope: "web_admin_deploy" | "web_messenger" | "web_full";
  pipeline: DeployPipelineSnapshot;
  verifiedBy: string | null;
  verifiedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  promotedBy: string | null;
  promotedAt: string | null;
  error: string | null;
  githubResult: string | null;
  /** After rollback — blocks re-promote until Owner re-approve */
  promoteLocked: boolean;
  promoteLockReason: string | null;
  updatedAt: string;
};

export const PIPELINE_STAGE_ORDER: readonly DeployPipelineStageId[] = [
  "A_github_main",
  "B_vercel_ready",
  "C_domain_aliased",
  "D_prod_smoke",
] as const;

export function emptyPipeline(
  mode: DeployPipelineSnapshot["mode"] = "idle"
): DeployPipelineSnapshot {
  const stages = {
    A_github_main: { state: "idle" as DeployPipelineStageState },
    B_vercel_ready: { state: "idle" as DeployPipelineStageState },
    C_domain_aliased: { state: "idle" as DeployPipelineStageState },
    D_prod_smoke: { state: "idle" as DeployPipelineStageState },
  };
  return { stages, allPass: false, mode };
}

export function computePipelineAllPass(pipeline: DeployPipelineSnapshot): boolean {
  return PIPELINE_STAGE_ORDER.every((id) => {
    const s = pipeline.stages[id]?.state;
    return s === "pass" || s === "skipped_mock";
  });
}

export function isShaFormat(sha: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(sha.trim());
}

export function normalizeSha(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!isShaFormat(s)) return null;
  return s.length >= 40 ? s.slice(0, 40) : s;
}

export function assertPhase1Layers(layers: DeployPromoteLayer[]):
  | { ok: true; layers: DeployPromoteLayer[] }
  | { ok: false; error: string } {
  const unique = [...new Set(layers)];
  for (const layer of unique) {
    if (!DEPLOY_PROMOTE_LAYERS_PHASE1.includes(layer)) {
      return { ok: false, error: `layer_not_in_phase1:${layer}` };
    }
  }
  if (unique.length === 0) {
    return { ok: false, error: "layers_required" };
  }
  return { ok: true, layers: unique };
}

export function assertWebOnlyLayers(layers: DeployPromoteLayer[]): boolean {
  return layers.length === 1 && layers[0] === "web";
}

export function assertPromoteReauth(confirm: string): boolean {
  return confirm.trim() === DEPLOY_PROMOTE_REAUTH_TOKEN;
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

export function canMarkVerified(status: DeployPromotionStatus): boolean {
  return (
    status === "unverified" ||
    status === "pending_verify" ||
    status === "gates_running" ||
    status === "failed" ||
    status === "verify_cancelled" ||
    status === "rolled_back"
  );
}

export function canCancelVerified(status: DeployPromotionStatus): boolean {
  return status === "verified";
}

export function canPromoteWeb(record: DeployPromotionRecord): {
  ok: boolean;
  reason?: string;
} {
  if (record.promoteLocked) {
    return { ok: false, reason: "promote_locked_after_rollback" };
  }
  if (record.status !== "verified") {
    return { ok: false, reason: "not_verified" };
  }
  if (!record.layers.includes("web")) {
    return { ok: false, reason: "web_layer_not_selected" };
  }
  return { ok: true };
}

/** Success statuses for history display (legacy + new). */
export function isPromoteSuccessStatus(status: DeployPromotionStatus): boolean {
  return status === "success" || status === "promoted";
}
