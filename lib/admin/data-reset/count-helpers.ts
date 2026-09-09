import type { SupabaseClient } from "@supabase/supabase-js";

export async function countTable(
  sb: SupabaseClient,
  table: string,
  filter?: { column: string; value: string } | { column: string; op: "is"; value: null }
): Promise<{ n: number; warning?: string }> {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    if ("op" in filter && filter.op === "is") {
      q = q.is(filter.column, filter.value);
    } else if ("value" in filter) {
      q = q.eq(filter.column, filter.value);
    }
  }
  const { count, error } = await q;
  if (error) {
    return { n: 0, warning: `${table}:${error.message}` };
  }
  return { n: count ?? 0 };
}

export async function countIn(
  sb: SupabaseClient,
  table: string,
  column: string,
  values: string[]
): Promise<{ n: number; warning?: string }> {
  if (!values.length) return { n: 0 };
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, values);
  if (error) return { n: 0, warning: `${table}:${error.message}` };
  return { n: count ?? 0 };
}

/** Friend either-endpoint count (owner OR target). */
export async function countFriendEitherEndpoint(
  sb: SupabaseClient,
  userId: string
): Promise<{ n: number; warning?: string }> {
  const { count, error } = await sb
    .from("user_social_relations")
    .select("*", { count: "exact", head: true })
    .or(`owner_user_id.eq.${userId},target_user_id.eq.${userId}`);
  if (error) return { n: 0, warning: `user_social_relations:${error.message}` };
  return { n: count ?? 0 };
}
