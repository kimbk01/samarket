/**
 * C2 — Stores composition policy persistence (overrides + logs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StoresCompositionIntervalContract,
  StoresCompositionSectionContract,
  StoresCompositionSurface,
} from "@/lib/stores/composition/stores-composition-contract";
import { resolveCompositionPolicyForSurface } from "@/lib/stores/composition/stores-composition-policy-resolve";
import type { CompositionPolicyCasResult } from "@/lib/stores/composition/stores-composition-policy-concurrency";
import type { StoresCompositionPolicyWriteInput } from "@/lib/stores/composition/stores-composition-policy-validation";

export type StoresCompositionPolicyOverrideDbRow = {
  surface: StoresCompositionSurface;
  slot: string;
  enabled: boolean;
  section_order: number;
  max_items: number | null;
  interval_consumed: boolean;
  interval_every_n: number | null;
  updated_at: string | null;
};

function isMissingTable(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || m.includes("does not exist");
}

function mapIntervalFromDb(
  consumed: boolean,
  everyN: number | null
): StoresCompositionIntervalContract {
  if (!consumed) return { consumed: false, reason: "NOT_CONSUMED" };
  return { consumed: true, everyN: everyN ?? 1 };
}

function mapIntervalToDb(interval: StoresCompositionIntervalContract): {
  interval_consumed: boolean;
  interval_every_n: number | null;
} {
  if (!interval.consumed) {
    return { interval_consumed: false, interval_every_n: null };
  }
  return { interval_consumed: true, interval_every_n: interval.everyN };
}

export async function listCompositionPolicyOverrides(
  sb: SupabaseClient,
  surface: StoresCompositionSurface
): Promise<StoresCompositionPolicyOverrideDbRow[]> {
  const { data, error } = await sb
    .from("store_composition_policy_overrides")
    .select(
      "surface, slot, enabled, section_order, max_items, interval_consumed, interval_every_n, updated_at"
    )
    .eq("surface", surface);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as StoresCompositionPolicyOverrideDbRow[];
}

export async function getCompositionPolicySurfaceRevision(
  sb: SupabaseClient,
  surface: StoresCompositionSurface
): Promise<number> {
  const { data, error } = await sb.rpc("ensure_store_composition_policy_surface_state", {
    p_surface: surface,
  });
  if (error) {
    if (isMissingTable(error) || error.message.includes("does not exist")) return 0;
    throw new Error(error.message);
  }
  const revision = Number(data);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

export async function loadResolvedCompositionPolicy(
  sb: SupabaseClient,
  surface: StoresCompositionSurface
): Promise<{
  rows: StoresCompositionSectionContract[];
  overrides: StoresCompositionPolicyOverrideDbRow[];
  revision: number;
}> {
  const revision = await getCompositionPolicySurfaceRevision(sb, surface);
  const overrides = await listCompositionPolicyOverrides(sb, surface);
  const overrideRows = overrides.map((o) => ({
    surface: o.surface,
    slot: o.slot,
    enabled: o.enabled,
    order: o.section_order,
    max: o.max_items,
    interval: mapIntervalFromDb(o.interval_consumed, o.interval_every_n),
    updatedAt: o.updated_at,
    hasOverride: true,
  }));
  const rows = resolveCompositionPolicyForSurface(surface, overrideRows);
  return { rows, overrides, revision };
}

export async function upsertCompositionPolicyOverridesWithCas(
  sb: SupabaseClient,
  surface: StoresCompositionSurface,
  rows: readonly StoresCompositionPolicyWriteInput[],
  actor: { userId: string; nickname: string },
  expectedRevision: number
): Promise<CompositionPolicyCasResult> {
  const payload = rows.map((row) => ({
    surface: row.surface,
    slot: row.slot,
    enabled: row.enabled,
    order: row.order,
    max: row.max,
    interval: row.interval,
  }));

  const { data, error } = await sb.rpc("save_store_composition_policy_surface_cas", {
    p_surface: surface,
    p_expected_revision: expectedRevision,
    p_rows: payload,
    p_actor_id: actor.userId,
    p_actor_nickname: actor.nickname,
  });

  if (error) {
    if (isMissingTable(error) || error.message.includes("does not exist")) {
      throw new Error("surface_revision_rpc_missing");
    }
    throw new Error(error.message);
  }

  const result = data as {
    ok?: boolean;
    error?: string;
    revision?: number;
    current_revision?: number;
    expected_revision?: number;
  };

  if (!result?.ok) {
    if (result?.error === "stale_revision") {
      return {
        ok: false,
        error: "stale_revision",
        currentRevision: Number(result.current_revision ?? -1),
        expectedRevision,
      };
    }
    return { ok: false, error: String(result?.error ?? "save_failed") };
  }

  return { ok: true, revision: Number(result.revision) };
}

/** @deprecated Use upsertCompositionPolicyOverridesWithCas — kept for tests without revision table. */
export async function upsertCompositionPolicyOverrides(
  sb: SupabaseClient,
  surface: StoresCompositionSurface,
  rows: readonly StoresCompositionPolicyWriteInput[],
  actor: { userId: string; nickname: string }
): Promise<void> {
  const existing = await listCompositionPolicyOverrides(sb, surface);
  const existingBySlot = new Map(existing.map((r) => [r.slot, r]));

  for (const row of rows) {
    const prev = existingBySlot.get(row.slot) ?? null;
    const intervalDb = mapIntervalToDb(row.interval);
    const payload = {
      surface,
      slot: row.slot,
      enabled: row.enabled,
      section_order: row.order,
      max_items: row.max,
      interval_consumed: intervalDb.interval_consumed,
      interval_every_n: intervalDb.interval_every_n,
      updated_by_user_id: actor.userId,
      ...(prev ? {} : { created_by_user_id: actor.userId }),
    };

    const { error } = await sb
      .from("store_composition_policy_overrides")
      .upsert(payload, { onConflict: "surface,slot" });
    if (error) throw new Error(error.message);

    await insertCompositionPolicyLog(sb, {
      surface,
      slot: row.slot,
      actionType: prev ? "update" : "create",
      adminId: actor.userId,
      adminNickname: actor.nickname,
      beforeJson: prev
        ? {
            enabled: prev.enabled,
            order: prev.section_order,
            max: prev.max_items,
            interval: mapIntervalFromDb(prev.interval_consumed, prev.interval_every_n),
          }
        : null,
      afterJson: {
        enabled: row.enabled,
        order: row.order,
        max: row.max,
        interval: row.interval,
      },
    });
  }
}

export async function insertCompositionPolicyLog(
  sb: SupabaseClient,
  input: {
    surface: StoresCompositionSurface;
    slot: string;
    actionType: string;
    adminId: string;
    adminNickname: string;
    beforeJson: Record<string, unknown> | null;
    afterJson: Record<string, unknown>;
    note?: string;
  }
): Promise<void> {
  const { error } = await sb.from("store_composition_policy_logs").insert({
    surface: input.surface,
    slot: input.slot,
    action_type: input.actionType,
    admin_id: input.adminId,
    admin_nickname: input.adminNickname,
    before_json: input.beforeJson,
    after_json: input.afterJson,
    note: input.note ?? "",
  });
  if (error && !isMissingTable(error)) {
    throw new Error(error.message);
  }
}
