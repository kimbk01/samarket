import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { listOrderChatRoomsForMe } from "@/lib/order-chat/service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/order-chat/rooms
 * - 쿼리 없음: 구매자 본인 주문 채팅 방 (`buyer_user_id`)
 * - `?store_id=UUID`: 해당 매장 사장 본인 방만 (`owner_user_id` + 소유 검증)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const storeId = req.nextUrl.searchParams.get("store_id")?.trim();
  const result = storeId
    ? await listOrderChatRoomsForMe(sb as import("@supabase/supabase-js").SupabaseClient<any>, {
        userId: auth.userId,
        mode: "owner",
        storeId,
      })
    : await listOrderChatRoomsForMe(sb as import("@supabase/supabase-js").SupabaseClient<any>, {
        userId: auth.userId,
        mode: "buyer",
      });

  if (!result.ok) {
    const st = "status" in result && typeof result.status === "number" ? result.status : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true, rooms: result.rooms });
}
