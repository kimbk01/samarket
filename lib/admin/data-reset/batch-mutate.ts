/**
 * Data Reset — batched "all rows" mutations for the per-domain engine.
 *
 * Replaces the former `select("id").limit(5000)` + `.in("id", ids)` pattern, which silently stopped
 * after 5,000 rows while the run still reported SUCCESS. These helpers loop until no matching row
 * is left, stop when a batch makes no progress, and finally count what remains: any remaining row is
 * returned as an error so the caller reports PARTIAL / FAILED instead of a false success.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const DATA_RESET_BATCH_SIZE = 1000;
export const DATA_RESET_MAX_BATCHES = 10_000;

/** Applies the same row filter to select / delete / update / count builders. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataResetRowFilter = (q: any) => any;

const identity: DataResetRowFilter = (q) => q;

export type BatchMutateResult = {
  affected: number;
  remaining: number;
  batches: number;
  error: string | null;
};

async function countRemaining(
  sb: SupabaseClient,
  table: string,
  filter: DataResetRowFilter
): Promise<{ n: number; error: string | null }> {
  const { count, error } = await filter(sb.from(table).select("id", { count: "exact", head: true }));
  if (error) return { n: -1, error: `${table}:count:${error.message}` };
  return { n: count ?? 0, error: null };
}

export async function deleteAllRowsInBatches(
  sb: SupabaseClient,
  table: string,
  opts: { filter?: DataResetRowFilter; batchSize?: number } = {}
): Promise<BatchMutateResult> {
  const filter = opts.filter ?? identity;
  const size = Math.max(1, Math.min(opts.batchSize ?? DATA_RESET_BATCH_SIZE, 5000));
  let affected = 0;
  let batches = 0;
  for (;;) {
    if (batches >= DATA_RESET_MAX_BATCHES) {
      return { affected, remaining: -1, batches, error: `${table}:max_batches_exceeded` };
    }
    const { data, error } = await filter(sb.from(table).select("id")).order("id").limit(size);
    if (error) return { affected, remaining: -1, batches, error: `${table}:select:${error.message}` };
    const ids = ((data ?? []) as Array<{ id: unknown }>).map((r) => String(r.id));
    if (!ids.length) break;
    batches += 1;
    const { error: dErr, count } = await filter(sb.from(table).delete({ count: "exact" }).in("id", ids));
    if (dErr) return { affected, remaining: -1, batches, error: `${table}:delete:${dErr.message}` };
    affected += count ?? 0;
    if (!count) return { affected, remaining: -1, batches, error: `${table}:delete_made_no_progress` };
  }
  const rest = await countRemaining(sb, table, filter);
  if (rest.error) return { affected, remaining: -1, batches, error: rest.error };
  return {
    affected,
    remaining: rest.n,
    batches,
    error: rest.n > 0 ? `${table}:rows_remaining_after_delete:${rest.n}` : null,
  };
}

/** Update every matching row in batches. `filter` must stop matching a row once it is updated
 *  (e.g. `.is("deleted_at", null)`), otherwise the loop reports no progress. */
export async function updateAllRowsInBatches(
  sb: SupabaseClient,
  table: string,
  patch: Record<string, unknown>,
  opts: { filter: DataResetRowFilter; batchSize?: number }
): Promise<BatchMutateResult> {
  const size = Math.max(1, Math.min(opts.batchSize ?? DATA_RESET_BATCH_SIZE, 5000));
  let affected = 0;
  let batches = 0;
  for (;;) {
    if (batches >= DATA_RESET_MAX_BATCHES) {
      return { affected, remaining: -1, batches, error: `${table}:max_batches_exceeded` };
    }
    const { data, error } = await opts.filter(sb.from(table).select("id")).order("id").limit(size);
    if (error) return { affected, remaining: -1, batches, error: `${table}:select:${error.message}` };
    const ids = ((data ?? []) as Array<{ id: unknown }>).map((r) => String(r.id));
    if (!ids.length) break;
    batches += 1;
    const { error: uErr, count } = await opts.filter(sb.from(table).update(patch, { count: "exact" }).in("id", ids));
    if (uErr) return { affected, remaining: -1, batches, error: `${table}:update:${uErr.message}` };
    affected += count ?? 0;
    if (!count) return { affected, remaining: -1, batches, error: `${table}:update_made_no_progress` };
  }
  const rest = await countRemaining(sb, table, opts.filter);
  if (rest.error) return { affected, remaining: -1, batches, error: rest.error };
  return {
    affected,
    remaining: rest.n,
    batches,
    error: rest.n > 0 ? `${table}:rows_remaining_after_update:${rest.n}` : null,
  };
}
