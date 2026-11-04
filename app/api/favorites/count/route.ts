/**
 * GET /api/favorites/count — 세션 사용자의 찜 개수 (거래 + 스토어)
 */
import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { countVisibleTradeFavoritesServer } from "@/lib/favorites/load-favorite-posts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const userId = (await getOptionalAuthenticatedUserId()) ?? "";
  if (!userId) {
    return NextResponse.json({ count: 0, trade_count: 0, store_count: 0 });
  }

  let tradeCount = 0;
  let storeCount = 0;

  try {
    /** 3차 실기 2-5 (H1): 찜 목록·칩 개수와 같은 정의 1곳 — 관리자 삭제 글 제외 */
    const n = await countVisibleTradeFavoritesServer(getSupabaseServer(), userId);
    if (typeof n === "number") tradeCount = n;
  } catch {
    /* ignore */
  }

  const sbStores = tryGetSupabaseForStores();
  if (sbStores) {
    try {
      const { count, error } = await sbStores
        .from("store_favorites")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (!error && typeof count === "number") storeCount = count;
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    count: tradeCount + storeCount,
    trade_count: tradeCount,
    store_count: storeCount,
  });
}
