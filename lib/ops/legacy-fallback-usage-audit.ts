/**
 * OPS1 / LFC1 — legacy fallback branch usage audit (delete gate; does not remove branches).
 */
import {
  evaluateLegacyFallbackDeleteGate,
  findLegacyFallbackRouteSpec,
  isLegacyFallbackHardDeleted,
  isRouteSnapshotOnly,
  LegacyFallbackBlockedError,
  LEGACY_FALLBACK_ROUTE_REGISTRY,
  type LegacyFallbackTrackId,
} from "@/lib/ops/legacy-fallback-cleanup-policy";
import { warnLegacyCleanupRegression } from "@/lib/ops/legacy-fallback-cleanup-regression-guard";

export type LegacyFallbackUsageAudit = {
  route: string;
  fallback_branch: string;
  used_count: 0 | 1;
  last_reason: string;
  rpc_deployed: 0 | 1;
  snapshot_available: 0 | 1;
  can_delete: 0 | 1;
  blocker?: string;
  reconnect_related: 0 | 1;
  prod_seen: 0 | 1;
  dev_only: 0 | 1;
  track?: LegacyFallbackTrackId;
};

export type LegacyFallbackAuditInput = {
  route: string;
  fallback_branch: string;
  reason: string;
  rpc_deployed?: boolean;
  snapshot_row_available?: boolean;
  blocker?: string;
  reconnect_related?: boolean;
  prod_seen?: boolean;
  dev_only?: boolean;
  /** When true, snapshot-only mode may throw instead of proceeding to legacy. */
  enforce_snapshot_only?: boolean;
};

function shouldLogLegacyFallbackAudit(): boolean {
  if (typeof process === "undefined") return true;
  return process.env.SAMARKET_LEGACY_FALLBACK_AUDIT?.trim() !== "0";
}

function isProdRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function buildAuditRow(input: LegacyFallbackAuditInput, used: 0 | 1): LegacyFallbackUsageAudit {
  const spec = findLegacyFallbackRouteSpec(input.route, input.fallback_branch);
  const rpc_deployed: 0 | 1 = input.rpc_deployed === false ? 0 : 1;
  const snapshot_available: 0 | 1 = input.snapshot_row_available === false ? 0 : 1;
  const deleteGate = evaluateLegacyFallbackDeleteGate({
    route: input.route,
    fallback_branch: input.fallback_branch,
    rpc_deployed: rpc_deployed === 1,
    snapshot_available: snapshot_available === 1,
    fallback_used_count: used,
    query_wave_2_ms: 0,
    rpc_removed: 1,
  });
  const reconnect_related: 0 | 1 =
    input.reconnect_related === true || spec?.reconnect_related === 1 ? 1 : 0;
  const dev_only: 0 | 1 =
    input.dev_only === true || (!isProdRuntime() && input.prod_seen !== true) ? 1 : 0;
  return {
    route: input.route,
    fallback_branch: input.fallback_branch,
    used_count: used,
    last_reason: input.reason,
    rpc_deployed,
    snapshot_available,
    can_delete: deleteGate.can_delete,
    blocker: deleteGate.blocker ?? input.blocker ?? input.reason,
    reconnect_related,
    prod_seen: input.prod_seen === true || (used === 1 && isProdRuntime()) ? 1 : 0,
    dev_only,
    track: spec?.track,
  };
}

function emitAudit(row: LegacyFallbackUsageAudit, level: "warn" | "log"): void {
  if (!shouldLogLegacyFallbackAudit()) return;
  if (level === "warn") {
    // eslint-disable-next-line no-console -- OPS1/LFC1 required audit output
    console.warn("[legacy-fallback-usage-audit]", row);
  } else {
    // eslint-disable-next-line no-console -- OPS1/LFC1 required audit output
    console.log("[legacy-fallback-usage-audit]", row);
  }
}

/** Emits `[legacy-fallback-usage-audit]` whenever a snapshot-first route hits legacy fallback. */
export function auditLegacyFallbackUsage(input: LegacyFallbackAuditInput): LegacyFallbackUsageAudit {
  const row = buildAuditRow(input, 1);
  emitAudit(row, "warn");

  warnLegacyCleanupRegression({
    route: input.route,
    alert: "legacy_builder_invoked",
    fallback_branch: input.fallback_branch,
    detail: input.reason,
  });

  if (isLegacyFallbackHardDeleted(input.route, input.fallback_branch)) {
    throw new LegacyFallbackBlockedError(
      input.route,
      input.fallback_branch,
      "hard_deleted_ops1b_gate"
    );
  }

  const snapshotOnly = isRouteSnapshotOnly(input.route);
  if (snapshotOnly || input.enforce_snapshot_only) {
    warnLegacyCleanupRegression({
      route: input.route,
      alert: "fallback_branch_reintroduced",
      fallback_branch: input.fallback_branch,
      detail: "snapshot_only_mode_active",
    });
    if (input.enforce_snapshot_only !== false) {
      throw new LegacyFallbackBlockedError(
        input.route,
        input.fallback_branch,
        snapshotOnly ? "snapshot_only_mode" : "enforce_snapshot_only"
      );
    }
  }

  return row;
}

/** Gate before legacy builder body — audits + optional block in snapshot-only mode. */
export function gateLegacyFallback(input: LegacyFallbackAuditInput): LegacyFallbackUsageAudit {
  return auditLegacyFallbackUsage(input);
}

/** Zero-usage probe for sign-off scripts (RPC deployed + snapshot table exists). */
export function logLegacyFallbackZeroUsageProbe(input: {
  route: string;
  fallback_branch: string;
  rpc_deployed: boolean;
  snapshot_row_available: boolean;
  reconnect_related?: boolean;
}): LegacyFallbackUsageAudit {
  const row = buildAuditRow(
    {
      route: input.route,
      fallback_branch: input.fallback_branch,
      reason: "signoff_probe_no_fallback",
      rpc_deployed: input.rpc_deployed,
      snapshot_row_available: input.snapshot_row_available,
      reconnect_related: input.reconnect_related,
    },
    0
  );
  emitAudit(row, "log");
  return row;
}

/** Static registry audit rows for verify scripts (no runtime fallback). */
export function buildLegacyFallbackRegistryAuditRows(): LegacyFallbackUsageAudit[] {
  return LEGACY_FALLBACK_ROUTE_REGISTRY.map((spec) =>
    buildAuditRow(
      {
        route: spec.route,
        fallback_branch: spec.fallback_branch,
        reason: "registry_static_probe",
        rpc_deployed: true,
        snapshot_row_available: true,
        reconnect_related: spec.reconnect_related === 1,
      },
      0
    )
  );
}
