import type { SupabaseClient } from "@supabase/supabase-js";

/** Head COUNT helper — returns null on error (never invent 0 from failure). */
export async function adminDomainCountExact(
  run: () => PromiseLike<{ count: number | null; error: { message?: string } | null }>
): Promise<number | null> {
  try {
    const { count, error } = await run();
    if (error) return null;
    return typeof count === "number" ? count : 0;
  } catch {
    return null;
  }
}

export function adminDomainCountFromClient(
  sb: SupabaseClient,
  table: string,
  apply?: (q: any) => any
): Promise<number | null> {
  const sbAny = sb as any;
  let q = sbAny.from(table).select("id", { count: "exact", head: true });
  if (apply) q = apply(q);
  return adminDomainCountExact(() => q);
}
