import type { SupabaseClient } from "@supabase/supabase-js";

/** 조회자가 구매자일 때만, 해당 방에 buyer→seller 후기가 있는지 */
export async function fetchBuyerReviewSubmitted(
  sb: SupabaseClient,
  productChatId: string | null | undefined,
  viewerUserId: string,
  buyerId: string
): Promise<boolean> {
  if (!productChatId?.trim() || viewerUserId !== buyerId) return false;
  const sbAny = sb as SupabaseClient;
  const { data } = await sbAny
    .from("transaction_reviews")
    .select("id")
    .eq("room_id", productChatId.trim())
    .eq("reviewer_id", viewerUserId)
    .eq("role_type", "buyer_to_seller")
    .maybeSingle();
  return !!data;
}
