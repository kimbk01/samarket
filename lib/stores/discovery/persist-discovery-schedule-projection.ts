import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeDiscoveryScheduleProjection,
  type DiscoveryScheduleProjectionInput,
} from "@/lib/stores/discovery/compute-discovery-schedule-projection";

export async function persistDiscoveryScheduleProjectionForStore(
  sb: SupabaseClient,
  storeId: string,
  input: DiscoveryScheduleProjectionInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = storeId.trim();
  if (!sid) return { ok: false, error: "missing_store_id" };

  const projection = computeDiscoveryScheduleProjection(input);
  const { error } = await sb
    .from("stores")
    .update({
      discovery_schedule_state: projection.discoveryScheduleState,
      next_schedule_transition_at: projection.nextScheduleTransitionAt,
    })
    .eq("id", sid);

  if (error) {
    console.error("[persistDiscoveryScheduleProjectionForStore]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function refreshDiscoveryScheduleProjectionForStoreId(
  sb: SupabaseClient,
  storeId: string,
  now = new Date()
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = storeId.trim();
  const { data, error } = await sb
    .from("stores")
    .select("id, business_hours_json, is_open, point_commerce_blocked")
    .eq("id", sid)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: error?.message ?? "store_not_found" };
  }

  return persistDiscoveryScheduleProjectionForStore(sb, sid, {
    business_hours_json: data.business_hours_json,
    is_open: data.is_open,
    point_commerce_blocked: data.point_commerce_blocked,
    now,
  });
}

export type ScheduleTransitionBatchResult = {
  processed: number;
  failed: number;
};

export async function runDiscoveryScheduleTransitionBatch(
  sb: SupabaseClient,
  opts: { batchSize?: number; now?: Date } = {}
): Promise<ScheduleTransitionBatchResult> {
  const limit = Math.max(1, Math.min(opts.batchSize ?? 100, 500));
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();

  const { data, error } = await sb
    .from("stores")
    .select("id, business_hours_json, is_open, point_commerce_blocked")
    .not("next_schedule_transition_at", "is", null)
    .lte("next_schedule_transition_at", nowIso)
    .order("next_schedule_transition_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[runDiscoveryScheduleTransitionBatch]", error.message);
    return { processed: 0, failed: 1 };
  }

  let processed = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const result = await persistDiscoveryScheduleProjectionForStore(sb, String(row.id), {
      business_hours_json: row.business_hours_json,
      is_open: row.is_open,
      point_commerce_blocked: row.point_commerce_blocked,
      now,
    });
    if (result.ok) processed += 1;
    else failed += 1;
  }
  return { processed, failed };
}
