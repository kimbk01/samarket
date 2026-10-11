/**
 * Full data reset — server orchestration (System → 데이터 초기화).
 *
 * All state and every rule live in Postgres (migration 20270425120000_data_reset_full_system.sql):
 *   window (two Super Admins) → plan / dry-run → confirm (backup reference) → approve (second admin)
 *   → run: DB batches → Storage objects → Auth accounts → verify → finish (window closes = re-lock).
 * This module only sequences RPC calls, performs the Storage API removals the database cannot do,
 * and writes refused attempts to the append-only audit trail.
 *
 * Destructive calls additionally require the P0 database-target guard (never a Production project)
 * and the DB guard row public.data_reset_db_guard (absent in Production).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveDataResetDatabaseTarget,
  resolveDataResetExecutionTarget,
} from "@/lib/admin/data-reset/database-target-guard";
import { FULL_RESET_MANIFEST, fullResetManifestStats } from "@/lib/admin/data-reset/full/manifest";
import { readCurrentDataResetWindow, type DataResetWindowRow } from "@/lib/admin/data-reset/full/window-gate";

export const FULL_RESET_BATCH_ROWS = 1000;
export const FULL_RESET_STORAGE_BATCH = 100;
export const FULL_RESET_AUTH_BATCH = 50;
export const FULL_RESET_ADVANCE_BUDGET_MS = 20_000;

export type FullResetPhrases = { confirm: string; approve: string; start: string };

export function fullResetPhrases(planHash: string | null | undefined): FullResetPhrases {
  const h = String(planHash ?? "").slice(0, 8);
  return { confirm: `CONFIRM ${h}`, approve: `APPROVE ${h}`, start: `RESET ${h}` };
}

export type FullResetResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; status: number };

function rpcError(message: string | undefined): string {
  const m = String(message ?? "rpc_failed");
  const known = m.match(
    /(data_reset_db_guard_locked|window_[a-z_]+|plan_[a-z_]+|two_person_rule_violated|backup_[a-z_]+|actor_not_signatory|run_[a-z_]+|manifest_[a-z_]+(: [^\n]+)?|fixpoint_not_reached|table_missing: \S+)/
  );
  return known ? known[0] : m.slice(0, 300);
}

export async function auditFullReset(
  sb: SupabaseClient,
  row: {
    actor: string | null;
    action: string;
    outcome: "ok" | "blocked" | "error";
    windowId?: string | null;
    planId?: string | null;
    runId?: string | null;
    detail?: Record<string, unknown>;
  }
): Promise<boolean> {
  const { error } = await sb.rpc("data_reset_audit_log", {
    p_actor: row.actor,
    p_action: row.action,
    p_outcome: row.outcome,
    p_window_id: row.windowId ?? null,
    p_plan_id: row.planId ?? null,
    p_run_id: row.runId ?? null,
    p_detail: row.detail ?? {},
  });
  if (error) console.error("[full-reset audit]", error.message);
  return !error;
}

/** Destructive preconditions that the server checks before calling a destructive RPC. */
export function fullResetDestructiveTargetCheck(env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; reason: string } {
  const t = resolveDataResetExecutionTarget(env);
  return t.allowed ? { ok: true } : { ok: false, reason: t.reason };
}

// ------------------------------------------------------------------------------------------------
// State
// ------------------------------------------------------------------------------------------------
export type FullResetPlanRow = {
  id: string;
  window_id: string;
  status: string;
  created_by: string;
  created_at: string;
  manifest_version: string;
  summary: Record<string, unknown> | null;
  plan_hash: string | null;
  backup_reference: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  expires_at: string;
};

export type FullResetRunRow = {
  id: string;
  plan_id: string;
  started_by: string;
  started_at: string;
  status: string;
  phase: string;
  abort_requested: boolean;
  finished_at: string | null;
  result: Record<string, unknown> | null;
  updated_at: string;
};

export type FullResetState = {
  locked: boolean;
  lockReasons: string[];
  window: DataResetWindowRow | null;
  plan: FullResetPlanRow | null;
  phrases: FullResetPhrases | null;
  run: FullResetRunRow | null;
  steps: Array<{ table_name: string; step_order: number; planned: number; deleted: number; skipped: number; status: string }>;
  authProgress: Record<string, number>;
  storageProgress: Record<string, number>;
  history: Array<{ window: Record<string, unknown>; plans: Array<Record<string, unknown>>; run: Record<string, unknown> | null }>;
  audit: Array<Record<string, unknown>>;
  databaseTarget: { target: string; projectRef: string | null; reason: string };
  dbGuard: { present: boolean; allowDestructive: boolean; environmentLabel: string | null };
  manifest: ReturnType<typeof fullResetManifestStats>;
};

function countBy(rows: Array<{ status: string }> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows ?? []) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

export async function getFullResetState(sb: SupabaseClient, actorUserId: string): Promise<FullResetResult<FullResetState>> {
  // Expire overdue windows first (flags their runs), then finish every run that must stop, so the
  // system re-locks even when nobody keeps the progress screen open. Only then read the window.
  const expire = await readCurrentDataResetWindow(sb);
  if (!expire.ok) return { ok: false, error: expire.reason, status: 503 };
  const { data: stale } = await sb
    .from("data_reset_runs")
    .select("id")
    .eq("status", "running")
    .eq("abort_requested", true);
  for (const r of (stale ?? []) as Array<{ id: string }>) {
    await sb.rpc("data_reset_full_finish_run", { p_run_id: r.id, p_actor: actorUserId, p_error: null });
  }
  const cur = await readCurrentDataResetWindow(sb);
  if (!cur.ok) return { ok: false, error: cur.reason, status: 503 };

  const windowRow = cur.window;
  let plan: FullResetPlanRow | null = null;
  if (windowRow?.id) {
    const { data } = await sb
      .from("data_reset_plans")
      .select("id, window_id, status, created_by, created_at, manifest_version, summary, plan_hash, backup_reference, confirmed_by, confirmed_at, approved_by, approved_at, expires_at")
      .eq("window_id", windowRow.id)
      .order("created_at", { ascending: false })
      .limit(1);
    plan = ((data ?? [])[0] as FullResetPlanRow | undefined) ?? null;
  }

  // Latest run (current window, or the most recent one for the results view)
  const { data: runRows } = await sb
    .from("data_reset_runs")
    .select("id, plan_id, started_by, started_at, status, phase, abort_requested, finished_at, result, updated_at")
    .order("started_at", { ascending: false })
    .limit(1);
  const run = ((runRows ?? [])[0] as FullResetRunRow | undefined) ?? null;

  let steps: FullResetState["steps"] = [];
  let authProgress: Record<string, number> = {};
  let storageProgress: Record<string, number> = {};
  if (run) {
    const [{ data: s }, { data: a }, { data: st }] = await Promise.all([
      sb.from("data_reset_run_steps").select("table_name, step_order, planned, deleted, skipped, status").eq("run_id", run.id).order("step_order").order("table_name"),
      sb.from("data_reset_plan_auth").select("status").eq("plan_id", run.plan_id),
      sb.from("data_reset_plan_storage").select("status").eq("plan_id", run.plan_id),
    ]);
    steps = (s ?? []) as FullResetState["steps"];
    authProgress = countBy(a as Array<{ status: string }>);
    storageProgress = countBy(st as Array<{ status: string }>);
  }

  const { data: windows } = await sb
    .from("data_reset_windows")
    .select("id, status, reason, requested_by, requested_at, approved_by, approved_at, open_until, closed_at, close_reason")
    .order("requested_at", { ascending: false })
    .limit(10);
  const winIds = ((windows ?? []) as Array<{ id: string }>).map((w) => w.id);
  const { data: histPlans } = winIds.length
    ? await sb.from("data_reset_plans").select("id, window_id, status, plan_hash, created_at, confirmed_by, approved_by").in("window_id", winIds)
    : { data: [] };
  const planIds = ((histPlans ?? []) as Array<{ id: string }>).map((p) => p.id);
  const { data: histRuns } = planIds.length
    ? await sb.from("data_reset_runs").select("id, plan_id, status, started_by, started_at, finished_at, result").in("plan_id", planIds)
    : { data: [] };
  const history = ((windows ?? []) as Array<Record<string, unknown>>).map((w) => {
    const plans = ((histPlans ?? []) as Array<Record<string, unknown>>).filter((p) => p.window_id === w.id);
    const run = ((histRuns ?? []) as Array<Record<string, unknown>>).find((r) => plans.some((p) => p.id === r.plan_id)) ?? null;
    return { window: w, plans, run };
  });

  const { data: audit } = await sb
    .from("data_reset_audit_events")
    .select("id, at, actor_user_id, action, outcome, window_id, plan_id, run_id, detail")
    .order("id", { ascending: false })
    .limit(50);

  const { data: guardRows } = await sb.from("data_reset_db_guard").select("allow_destructive, environment_label").limit(1);
  const guard = ((guardRows ?? [])[0] as { allow_destructive: boolean; environment_label: string } | undefined) ?? null;
  const target = resolveDataResetDatabaseTarget();

  const lockReasons: string[] = [];
  if (!windowRow || windowRow.status !== "open") lockReasons.push("window_not_open");
  const exec = resolveDataResetExecutionTarget();
  if (!exec.allowed) lockReasons.push(exec.reason);
  if (!guard?.allow_destructive) lockReasons.push("db_guard_locked");

  return {
    ok: true,
    data: {
      locked: lockReasons.length > 0,
      lockReasons,
      window: windowRow,
      plan,
      phrases: plan?.plan_hash ? fullResetPhrases(plan.plan_hash) : null,
      run,
      steps,
      authProgress,
      storageProgress,
      history,
      audit: (audit ?? []) as Array<Record<string, unknown>>,
      databaseTarget: target,
      dbGuard: { present: Boolean(guard), allowDestructive: Boolean(guard?.allow_destructive), environmentLabel: guard?.environment_label ?? null },
      manifest: fullResetManifestStats(),
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Transitions (each one is a single RPC; the database enforces the rules)
// ------------------------------------------------------------------------------------------------
async function call<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<FullResetResult<T>> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, error: rpcError(error.message), status: 409 };
  return { ok: true, data: data as T };
}

export function requestWindow(sb: SupabaseClient, actor: string, reason: string) {
  const target = resolveDataResetDatabaseTarget();
  return call<string>(sb, "data_reset_window_request", {
    p_actor: actor,
    p_reason: reason,
    p_target: `${target.target}:${target.projectRef ?? "-"}`,
  });
}

export function decideWindow(sb: SupabaseClient, actor: string, windowId: string, approve: boolean, minutes: number) {
  return call<DataResetWindowRow>(sb, "data_reset_window_decide", {
    p_window_id: windowId,
    p_actor: actor,
    p_approve: approve,
    p_minutes: minutes,
  });
}

export function closeWindow(sb: SupabaseClient, actor: string, windowId: string, reason: string) {
  return call<null>(sb, "data_reset_window_close", { p_window_id: windowId, p_actor: actor, p_reason: reason });
}

/** Dry-run: creates the plan and computes every target / kept reason. Deletes nothing. */
export async function buildPlan(sb: SupabaseClient, actor: string, windowId: string): Promise<FullResetResult<{ planId: string; summary: Record<string, unknown> }>> {
  const created = await call<string>(sb, "data_reset_plan_create", {
    p_window_id: windowId,
    p_actor: actor,
    p_version: FULL_RESET_MANIFEST.version,
    p_manifest: FULL_RESET_MANIFEST,
  });
  if (!created.ok) return created;
  const built = await call<Record<string, unknown>>(sb, "data_reset_full_build_plan", { p_plan_id: created.data });
  if (!built.ok) {
    await auditFullReset(sb, { actor, action: "plan_build", outcome: "error", windowId, planId: created.data, detail: { error: built.error } });
    return built;
  }
  return { ok: true, data: { planId: created.data, summary: built.data } };
}

export function confirmPlan(sb: SupabaseClient, actor: string, planId: string, planHash: string, backupReference: string) {
  return call<null>(sb, "data_reset_plan_confirm", {
    p_plan_id: planId,
    p_actor: actor,
    p_plan_hash: planHash,
    p_backup_reference: backupReference,
  });
}

export function approvePlan(sb: SupabaseClient, actor: string, planId: string, planHash: string) {
  return call<null>(sb, "data_reset_plan_approve", { p_plan_id: planId, p_actor: actor, p_plan_hash: planHash });
}

export async function startRun(sb: SupabaseClient, actor: string, planId: string): Promise<FullResetResult<string>> {
  const target = fullResetDestructiveTargetCheck();
  if (!target.ok) return { ok: false, error: target.reason, status: 403 };
  return call<string>(sb, "data_reset_full_start_run", { p_plan_id: planId, p_actor: actor });
}

export function requestAbort(sb: SupabaseClient, actor: string, runId: string) {
  return call<null>(sb, "data_reset_run_request_abort", { p_run_id: runId, p_actor: actor });
}

// ------------------------------------------------------------------------------------------------
// Run advancement (time-budgeted; the UI calls it repeatedly; every step is resumable)
// ------------------------------------------------------------------------------------------------
export type AdvanceOutcome = {
  phase: string;
  status: string;
  finished: boolean;
  busy?: boolean;
  calls: number;
  last?: unknown;
  finish?: unknown;
};

async function finish(sb: SupabaseClient, runId: string, actor: string, err: string | null) {
  return call<{ status: string; result: Record<string, unknown> }>(sb, "data_reset_full_finish_run", {
    p_run_id: runId,
    p_actor: actor,
    p_error: err,
  });
}

export async function advanceRun(
  sb: SupabaseClient,
  actor: string,
  runId: string,
  budgetMs: number = FULL_RESET_ADVANCE_BUDGET_MS
): Promise<FullResetResult<AdvanceOutcome>> {
  const target = fullResetDestructiveTargetCheck();
  if (!target.ok) return { ok: false, error: target.reason, status: 403 };

  const deadline = Date.now() + budgetMs;
  let calls = 0;
  let last: unknown = null;
  for (;;) {
    const { data: runRow, error: runErr } = await sb.from("data_reset_runs").select("status, phase, abort_requested").eq("id", runId).maybeSingle();
    if (runErr || !runRow) return { ok: false, error: "run_not_found", status: 404 };
    const r = runRow as { status: string; phase: string; abort_requested: boolean };
    if (r.status !== "running") return { ok: true, data: { phase: r.phase, status: r.status, finished: true, calls, last } };
    if (Date.now() >= deadline) return { ok: true, data: { phase: r.phase, status: r.status, finished: false, calls, last } };
    calls += 1;

    if (r.phase === "verify" || r.abort_requested) {
      const f = await finish(sb, runId, actor, null);
      if (!f.ok) return f;
      return { ok: true, data: { phase: "done", status: f.data.status, finished: true, calls, last, finish: f.data } };
    }

    if (r.phase === "db") {
      const res = await call<Record<string, unknown>>(sb, "data_reset_full_execute_batch", { p_run_id: runId, p_limit: FULL_RESET_BATCH_ROWS });
      if (!res.ok) {
        await auditFullReset(sb, { actor, action: "db_batch", outcome: "error", runId, detail: { error: res.error } });
        return res; // transaction rolled back; state unchanged → safe to retry ("계속") or abort
      }
      last = res.data;
      if (res.data.busy) return { ok: true, data: { phase: r.phase, status: r.status, finished: false, busy: true, calls, last } };
      continue;
    }

    if (r.phase === "storage") {
      const claim = await call<{ busy?: boolean; abort?: boolean; done?: boolean; items?: Array<{ bucket: string; name: string }> }>(
        sb,
        "data_reset_full_storage_claim",
        { p_run_id: runId, p_limit: FULL_RESET_STORAGE_BATCH }
      );
      if (!claim.ok) return claim;
      last = { storage: claim.data.items?.length ?? 0 };
      if (claim.data.busy) return { ok: true, data: { phase: r.phase, status: r.status, finished: false, busy: true, calls, last } };
      if (claim.data.abort || claim.data.done) continue;
      const byBucket = new Map<string, string[]>();
      for (const it of claim.data.items ?? []) byBucket.set(it.bucket, [...(byBucket.get(it.bucket) ?? []), it.name]);
      for (const [bucket, names] of byBucket) {
        const { error } = await sb.storage.from(bucket).remove(names);
        // The database records "deleted" only for objects that are really gone (storage.objects).
        const mark = await call<unknown>(sb, "data_reset_full_storage_mark", {
          p_run_id: runId,
          p_bucket: bucket,
          p_names: names,
          p_error: error ? error.message : null,
        });
        if (!mark.ok) return mark;
      }
      continue;
    }

    if (r.phase === "auth") {
      const res = await call<Record<string, unknown>>(sb, "data_reset_full_auth_batch", { p_run_id: runId, p_limit: FULL_RESET_AUTH_BATCH });
      if (!res.ok) {
        await auditFullReset(sb, { actor, action: "auth_batch", outcome: "error", runId, detail: { error: res.error } });
        return res;
      }
      last = res.data;
      if (res.data.busy) return { ok: true, data: { phase: r.phase, status: r.status, finished: false, busy: true, calls, last } };
      continue;
    }

    return { ok: false, error: `unknown_phase:${r.phase}`, status: 500 };
  }
}
