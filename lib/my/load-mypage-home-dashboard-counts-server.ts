import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { MyPageHomeDashboardCounts } from "@/lib/my/types";

async function countBuyerVisibleStoreOrders(buyerId: string): Promise<number | null> {
  const sb = tryGetSupabaseForStores();
  if (!sb) return null;
  const base = () =>
    sb.from("store_orders").select("id", { count: "exact", head: true }).eq("buyer_user_id", buyerId);

  try {
    const { data: hiddenRows, error: hErr } = await sb
      .from("store_order_buyer_hides")
      .select("order_id")
      .eq("buyer_user_id", buyerId);

    if (hErr) {
      if (hErr.message?.includes("does not exist") && hErr.message?.includes("store_order_buyer_hides")) {
        const { count, error } = await base();
        if (error) return null;
        return count ?? 0;
      }
      return null;
    }

    const hiddenIds = (hiddenRows ?? [])
      .map((r) => String((r as { order_id?: string }).order_id ?? "").trim())
      .filter(Boolean);

    if (hiddenIds.length === 0) {
      const { count, error } = await base();
      if (error) return null;
      return count ?? 0;
    }

    const { count, error } = await base().not("id", "in", `(${hiddenIds.join(",")})`);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function countCommunityPostsVisibleForUser(userId: string): Promise<number | null> {
  try {
    const sb = getSupabaseServer();
    const { count, error } = await sb
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_hidden", false);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/** Prefetch home stats for /mypage (avoids heavy client list fetches). */
export async function loadMypageHomeDashboardCountsServer(
  userId: string
): Promise<MyPageHomeDashboardCounts | null> {
  const uid = userId.trim();
  if (!uid) return null;
  const [storeOrderCount, communityPostCount] = await Promise.all([
    countBuyerVisibleStoreOrders(uid),
    countCommunityPostsVisibleForUser(uid),
  ]);
  return { storeOrderCount, communityPostCount };
}
