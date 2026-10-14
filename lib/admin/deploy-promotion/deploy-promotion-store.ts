/**
 * Deploy promotion ledger (process memory + optional Supabase table).
 * Table: public.dibay_deploy_promotion_ledger (TEST migration; never auto-apply to prod).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyPipeline,
  type DeployPipelineSnapshot,
  type DeployPromoteLayer,
  type DeployPromotionRecord,
  type DeployPromotionStatus,
  computePipelineAllPass,
} from "./deploy-promotion-ssot";
import type { DeployEvidenceRecord } from "./deploy-evidence-gates";

type MutableRecord = DeployPromotionRecord & {
  evidence: DeployEvidenceRecord[];
};

const g = globalThis as unknown as {
  __dibayDeployPromotionStore?: Map<string, MutableRecord>;
  __dibayDeployPromotionHistory?: Array<{
    at: string;
    sha: string;
    action: string;
    actorUserId: string;
    detail?: string;
  }>;
};

function map(): Map<string, MutableRecord> {
  if (!g.__dibayDeployPromotionStore) {
    g.__dibayDeployPromotionStore = new Map();
  }
  return g.__dibayDeployPromotionStore;
}

function history() {
  if (!g.__dibayDeployPromotionHistory) {
    g.__dibayDeployPromotionHistory = [];
  }
  return g.__dibayDeployPromotionHistory;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultRecord(sha: string): MutableRecord {
  return {
    sha: sha.toLowerCase(),
    layers: ["web"],
    status: "pending_verify",
    impactScope: "web_admin_deploy",
    pipeline: emptyPipeline("idle"),
    verifiedBy: null,
    verifiedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    promotedBy: null,
    promotedAt: null,
    error: null,
    githubResult: null,
    promoteLocked: false,
    promoteLockReason: null,
    updatedAt: nowIso(),
    evidence: [],
  };
}

function stripEvidence(r: MutableRecord): DeployPromotionRecord {
  const { evidence: _e, ...rest } = r;
  return rest;
}

/** @deprecated alias — prefer getOrCreatePromotionRecord */
export function getDeployPromotionRecord(sha: string): DeployPromotionRecord | null {
  const r = map().get(sha.toLowerCase());
  return r ? stripEvidence(r) : null;
}

export function getPromotionRecord(sha: string): DeployPromotionRecord | null {
  return getDeployPromotionRecord(sha);
}

export function getOrCreatePromotionRecord(sha: string): DeployPromotionRecord {
  const key = sha.toLowerCase();
  const m = map();
  let r = m.get(key);
  if (!r) {
    r = defaultRecord(key);
    m.set(key, r);
  }
  return stripEvidence(r);
}

/**
 * Legacy upsert used by older promote path — merges into full record shape.
 */
export function upsertDeployPromotionRecord(
  record: Partial<DeployPromotionRecord> & {
    sha: string;
    status: DeployPromotionStatus;
    layers: DeployPromoteLayer[];
  }
): DeployPromotionRecord {
  const key = record.sha.toLowerCase();
  const m = map();
  const prev = m.get(key) ?? defaultRecord(key);
  const next: MutableRecord = {
    ...prev,
    ...record,
    sha: key,
    layers: record.layers,
    status: record.status,
    verifiedBy: record.verifiedBy ?? prev.verifiedBy,
    verifiedAt: record.verifiedAt ?? prev.verifiedAt,
    cancelledBy: record.cancelledBy ?? prev.cancelledBy,
    cancelledAt: record.cancelledAt ?? prev.cancelledAt,
    promotedBy: record.promotedBy ?? prev.promotedBy,
    promotedAt: record.promotedAt ?? prev.promotedAt,
    error: record.error ?? prev.error,
    githubResult: record.githubResult ?? prev.githubResult,
    impactScope: record.impactScope ?? prev.impactScope,
    pipeline: record.pipeline ?? prev.pipeline,
    promoteLocked: record.promoteLocked ?? prev.promoteLocked,
    promoteLockReason: record.promoteLockReason ?? prev.promoteLockReason,
    updatedAt: nowIso(),
    evidence: prev.evidence,
  };
  m.set(key, next);
  return stripEvidence(next);
}

export function listRecentDeployPromotionRecords(limit = 20): DeployPromotionRecord[] {
  return [...map().values()]
    .map(stripEvidence)
    .sort((a, b) =>
      (b.verifiedAt ?? b.promotedAt ?? b.updatedAt).localeCompare(
        a.verifiedAt ?? a.promotedAt ?? a.updatedAt
      )
    )
    .slice(0, limit);
}

export function listEvidenceForSha(sha: string): DeployEvidenceRecord[] {
  return [...(map().get(sha.toLowerCase())?.evidence ?? [])];
}

export function upsertEvidence(rec: DeployEvidenceRecord): void {
  const key = rec.sha.toLowerCase();
  const m = map();
  let row = m.get(key);
  if (!row) {
    row = defaultRecord(key);
    m.set(key, row);
  }
  row.evidence = row.evidence.filter(
    (e) => !(e.gateId === rec.gateId && e.evidenceId === rec.evidenceId)
  );
  row.evidence.push({ ...rec, sha: key });
  if (row.status === "pending_verify" || row.status === "unverified") {
    row.status = "gates_running";
  }
  row.updatedAt = nowIso();
  history().unshift({
    at: nowIso(),
    sha: key,
    action: "evidence",
    actorUserId: "system",
    detail: `${rec.gateId}:${rec.result}`,
  });
}

/** Invalidate prior verify when a new TEST SHA is active. */
export function invalidateVerifiedIfShaChanged(
  previousSha: string | null,
  nextSha: string
): void {
  if (!previousSha || previousSha === nextSha) return;
  const prev = map().get(previousSha.toLowerCase());
  if (prev && prev.status === "verified") {
    prev.status = "verify_cancelled";
    prev.cancelledBy = "system_sha_changed";
    prev.cancelledAt = nowIso();
    prev.updatedAt = nowIso();
    history().unshift({
      at: nowIso(),
      sha: previousSha,
      action: "invalidate_sha_changed",
      actorUserId: "system",
      detail: `next=${nextSha}`,
    });
  }
}

export function markVerified(input: {
  sha: string;
  actorUserId: string;
  layers: DeployPromoteLayer[];
  impactScope: DeployPromotionRecord["impactScope"];
}): DeployPromotionRecord {
  return upsertDeployPromotionRecord({
    sha: input.sha,
    layers: input.layers,
    impactScope: input.impactScope,
    status: "verified",
    verifiedBy: input.actorUserId,
    verifiedAt: nowIso(),
    cancelledBy: null,
    cancelledAt: null,
    error: null,
  });
}

export function cancelVerified(input: {
  sha: string;
  actorUserId: string;
}): DeployPromotionRecord | null {
  const prev = map().get(input.sha.toLowerCase());
  if (!prev || prev.status !== "verified") return null;
  prev.status = "verify_cancelled";
  prev.cancelledBy = input.actorUserId;
  prev.cancelledAt = nowIso();
  prev.updatedAt = nowIso();
  history().unshift({
    at: nowIso(),
    sha: input.sha,
    action: "cancel_verified",
    actorUserId: input.actorUserId,
  });
  return stripEvidence(prev);
}

export function setPipelineMock(
  sha: string,
  pipeline: DeployPipelineSnapshot
): DeployPromotionRecord {
  const key = sha.toLowerCase();
  const m = map();
  let row = m.get(key);
  if (!row) {
    row = defaultRecord(key);
    m.set(key, row);
  }
  const nextPipeline = {
    ...pipeline,
    allPass: computePipelineAllPass(pipeline),
  };
  row.pipeline = nextPipeline;
  row.updatedAt = nowIso();
  history().unshift({
    at: nowIso(),
    sha: key,
    action: "pipeline_mock",
    actorUserId: "system",
    detail: nextPipeline.allPass ? "all_pass" : "partial",
  });
  return stripEvidence(row);
}

export function lockPromoteAfterRollback(input: {
  sha: string;
  actorUserId: string;
  reason: string;
}): DeployPromotionRecord {
  return upsertDeployPromotionRecord({
    sha: input.sha,
    layers: ["web"],
    status: "promote_locked",
    promoteLocked: true,
    promoteLockReason: input.reason,
  });
}

export function listPromotionHistory(limit = 20) {
  return history().slice(0, limit);
}

type LedgerRow = {
  sha: string;
  status: string;
  layers: DeployPromoteLayer[] | null;
  impact_scope: string | null;
  pipeline: DeployPipelineSnapshot | null;
  gates: DeployEvidenceRecord[] | null;
  verified_by: string | null;
  verified_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  promoted_by: string | null;
  promoted_at: string | null;
  error: string | null;
  github_result: string | null;
  promote_locked: boolean | null;
  promote_lock_reason: string | null;
  updated_at: string | null;
};

function applyLedgerRowToMemory(row: LedgerRow): MutableRecord {
  const key = row.sha.toLowerCase();
  const evidence = Array.isArray(row.gates) ? row.gates.map((g) => ({ ...g, sha: key })) : [];
  const next: MutableRecord = {
    sha: key,
    layers: Array.isArray(row.layers) && row.layers.length > 0 ? row.layers : ["web"],
    status: (row.status as DeployPromotionStatus) || "pending_verify",
    impactScope: (row.impact_scope as DeployPromotionRecord["impactScope"]) || "web_admin_deploy",
    pipeline: row.pipeline ?? emptyPipeline("idle"),
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    promotedBy: row.promoted_by,
    promotedAt: row.promoted_at,
    error: row.error,
    githubResult: row.github_result,
    promoteLocked: Boolean(row.promote_locked),
    promoteLockReason: row.promote_lock_reason,
    updatedAt: row.updated_at ?? nowIso(),
    evidence,
  };
  map().set(key, next);

  // Seed audit trail once per process when memory history is empty.
  if (history().length === 0) {
    for (const e of evidence) {
      history().push({
        at: e.executedAt || next.updatedAt,
        sha: key,
        action: "evidence",
        actorUserId: "system",
        detail: `${e.gateId}:${e.result}`,
      });
    }
    if (next.verifiedAt) {
      history().unshift({
        at: next.verifiedAt,
        sha: key,
        action: "mark_verified",
        actorUserId: next.verifiedBy ?? "system",
      });
    }
    if (next.cancelledAt) {
      history().unshift({
        at: next.cancelledAt,
        sha: key,
        action: "cancel_verified",
        actorUserId: next.cancelledBy ?? "system",
      });
    }
    if (next.pipeline?.mode === "mock_test") {
      history().unshift({
        at: next.updatedAt,
        sha: key,
        action: "pipeline_mock",
        actorUserId: "system",
        detail: next.pipeline.allPass ? "all_pass" : "partial",
      });
    }
  }
  return next;
}

/**
 * Reload durable TEST ledger into process memory (serverless cold-start recovery).
 * No-op when memory already has evidence or a non-default status for the SHA.
 */
export async function hydratePromotionRecordFromLedger(
  sb: SupabaseClient,
  sha: string
): Promise<{ hydrated: boolean; error?: string }> {
  const key = sha.toLowerCase();
  const existing = map().get(key);
  if (
    existing &&
    (existing.evidence.length > 0 ||
      (existing.status !== "pending_verify" && existing.status !== "unverified"))
  ) {
    return { hydrated: false };
  }

  try {
    const { data, error } = await sb
      .from("dibay_deploy_promotion_ledger")
      .select(
        "sha,status,layers,impact_scope,pipeline,gates,verified_by,verified_at,cancelled_by,cancelled_at,promoted_by,promoted_at,error,github_result,promote_locked,promote_lock_reason,updated_at"
      )
      .eq("sha", key)
      .maybeSingle();
    if (error) return { hydrated: false, error: error.message };
    if (!data) return { hydrated: false };
    applyLedgerRowToMemory(data as LedgerRow);
    return { hydrated: true };
  } catch (e) {
    return {
      hydrated: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Best-effort persist when TEST table exists (service role client). */
export async function tryPersistLedgerRow(
  sb: SupabaseClient,
  record: DeployPromotionRecord,
  evidence: DeployEvidenceRecord[]
): Promise<{ persisted: boolean; error?: string }> {
  try {
    const { error } = await sb.from("dibay_deploy_promotion_ledger").upsert(
      {
        sha: record.sha,
        status: record.status,
        layers: record.layers,
        impact_scope: record.impactScope,
        pipeline: record.pipeline,
        gates: evidence,
        verified_by: record.verifiedBy,
        verified_at: record.verifiedAt,
        cancelled_by: record.cancelledBy,
        cancelled_at: record.cancelledAt,
        promoted_by: record.promotedBy,
        promoted_at: record.promotedAt,
        error: record.error,
        github_result: record.githubResult,
        promote_locked: record.promoteLocked,
        promote_lock_reason: record.promoteLockReason,
        updated_at: record.updatedAt,
      },
      { onConflict: "sha" }
    );
    if (error) {
      return { persisted: false, error: error.message };
    }
    return { persisted: true };
  } catch (e) {
    return {
      persisted: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
