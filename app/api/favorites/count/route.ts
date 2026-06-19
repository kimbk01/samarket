/**
 * GET /api/favorites/count — 세션 사용자의 찜 개수 (거래 + 스토어)
 */
import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

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
    const sb = getSupabaseServer();
    const { count, error } = await sb
      .from("favorites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (!error && typeof count === "number") tradeCount = count;
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
