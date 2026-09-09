/**
 * DIBAY Data Reset SSOT — types (operational Admin reset).
 * Plan authority: buildDomainResetPlan (preview + execute).
 */

import { createHash } from "node:crypto";
import type { DataResetDerivedTarget } from "@/lib/admin/data-reset/derived-state";

export type { DataResetDerivedTarget };

export const DATA_RESET_DOMAINS = [
  "community",
  "market",
  "delivery",
  "chat",
  "friend",
  "member",
  "finance",
  "full",
] as const;

export type DataResetDomain = (typeof DATA_RESET_DOMAINS)[number];

export const DATA_RESET_SCOPES = ["single", "user", "type", "all"] as const;
export type DataResetScope = (typeof DATA_RESET_SCOPES)[number];

export type DataResetMode = "preview" | "execute";

export type DataResetRequest = {
  domain: DataResetDomain;
  scope: DataResetScope;
  entityId?: string;
  /** chat type · delivery layer · member mode */
  subtype?: string;
  mode: DataResetMode;
};

export type DataResetRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DataResetConfirmationLevel = 1 | 2 | 3;

export type DataResetTableAction = {
  table: string;
  action: "DELETE" | "SOFT" | "DETACH" | "RESET_STATE" | "PRESERVE" | "BLOCKED";
  filterDescription: string;
  estimatedRows: number;
  phase: "DB" | "STORAGE" | "DERIVED";
};

/** Entity-owned Storage object bound into planHash (preview === execute). */
export type DataResetStorageTarget = {
  bucket: string;
  path: string;
  domain: string;
  entityType: string;
  entityId: string;
  ownership: string;
  cleanupPolicy: "DELETE" | "PRESERVE" | "SKIP_AMBIGUOUS";
  reference: string;
};

export type DataResetPlan = {
  planId: string;
  domain: DataResetDomain;
  scope: DataResetScope;
  entityId: string | null;
  subtype: string | null;
  targetLabel: string;
  delete: DataResetTableAction[];
  softDelete: DataResetTableAction[];
  detach: DataResetTableAction[];
  resetState: DataResetTableAction[];
  preserve: string[];
  blocked: string[];
  storage: DataResetTableAction[];
  /** Concrete post-images (and only planned) object identities — hash-bound. */
  storageTargets: DataResetStorageTarget[];
  /** Structured derived targets (hash-bound via derivedTargetsHashIdentity). */
  derivedStateTargets: DataResetDerivedTarget[];
  /** Client invalidation namespaces for browser apply after execute. */
  clientInvalidation: string[];
  /** Human-readable derived labels (kind:operation). */
  derivedState: string[];
  estimatedCounts: Record<string, number>;
  deleteCounts: Record<string, number>;
  softDeleteCounts: Record<string, number>;
  detachCounts: Record<string, number>;
  storageCount: number;
  preserveSummary: string[];
  warnings: string[];
  blockers: string[];
  blockedReason: string | null;
  riskLevel: DataResetRiskLevel;
  confirmationLevel: DataResetConfirmationLevel;
  typedConfirmationPhrase: string;
  executeAllowed: boolean;
  environment: "local" | "staging" | "production";
  planHash: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  clientSessionInvalidationRequired: boolean;
  /** FK migration may be unapplied on Production — never claim RESTRICT as live there. */
  schemaGuard: {
    b1b2MigrationFile: string;
    productionFkAssumeRestrict: false;
    note: string;
  };
};

export type DataResetPhaseResult = {
  phase: "VERIFY" | "DB" | "STORAGE" | "DERIVED" | "AUDIT";
  status: "PASS" | "FAIL" | "PARTIAL" | "BLOCKED" | "SKIPPED";
  detail: string;
  counts?: Record<string, number>;
};

export type DataResetExecuteResult = {
  ok: boolean;
  overall: "SUCCESS" | "PARTIAL" | "FAILED" | "BLOCKED";
  plan: DataResetPlan;
  phases: DataResetPhaseResult[];
  executedCounts: Record<string, number>;
  clientSessionInvalidationRequired: boolean;
  clientInvalidation?: string[];
};

export type DataResetDomainSummaryRow = {
  domain: DataResetDomain;
  labelKo: string;
  labelEn: string;
  status: "ok" | "protected" | "partial";
  primaryCount: number;
  detailCounts: Record<string, number>;
  executeDefault: "allowed_gated" | "preview_only" | "blocked";
};

export function hashDataResetPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

export function issueDataResetOneTimeToken(input: {
  planId: string;
  planHash: string;
  actorUserId: string;
}): string {
  return hashDataResetPayload({
    kind: "data_reset_ot",
    planId: input.planId,
    planHash: input.planHash,
    actorUserId: input.actorUserId,
  });
}

export function verifyDataResetOneTimeToken(
  token: string,
  input: { planId: string; planHash: string; actorUserId: string }
): boolean {
  const expected = issueDataResetOneTimeToken(input);
  return Boolean(token) && token === expected;
}

export const DATA_RESET_PLAN_TTL_MS = 15 * 60 * 1000;

export const DATA_RESET_FORBIDDEN_OPS = {
  wipeAllAppDataSql: "supabase/scripts/wipe-all-app-data.sql",
  truncateCascadePublic: true,
  bucketWidePurge: true,
  financeHardResetDefault: true,
  authAccountDeleteDefault: true,
  productionExecute: true,
} as const;

export const DATA_RESET_CANONICAL_ROUTE = "/admin/system/data-reset" as const;
export const DATA_RESET_B1B2_MIGRATION =
  "supabase/migrations/20261213120000_data_reset_blocker_close_b1_b2_fk.sql" as const;
