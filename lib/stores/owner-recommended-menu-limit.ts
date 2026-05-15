import type { SupabaseClient } from "@supabase/supabase-js";

export const OWNER_RECOMMENDED_MENU_MAX = 6;

/**
 * `is_owner_recommended=true` 이고 삭제되지 않은 상품 수.
 */
export async function countOwnerRecommendedProducts(
  sb: SupabaseClient,
  storeId: string,
  excludeProductId?: string | null
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;

  let q = sb
    .from("store_products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("is_owner_recommended", true)
    .not("product_status", "eq", "deleted");

  const ex = excludeProductId?.trim();
  if (ex) {
    q = q.neq("id", ex);
  }

  const { count, error } = await q;
  if (error) {
    console.error("[countOwnerRecommendedProducts]", error.message);
    return 0;
  }
  return typeof count === "number" ? count : 0;
}
