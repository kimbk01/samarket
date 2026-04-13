import type { SupabaseClient } from "@supabase/supabase-js";

/** 매장 오너 배지용: 미답변 문의(status=open) 건수 */
export async function countOpenStoreInquiriesForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("status", "open");
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}
