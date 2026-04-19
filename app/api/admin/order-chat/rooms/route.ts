import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { listOrderChatRoomsForAdmin } from "@/lib/order-chat/service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/order-chat/rooms — 관리자 주문 채팅 방 목록 (order_chat_rooms)
 * Query: limit (1–300, default 100)
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const raw = req.nextUrl.searchParams.get("limit");
  const n = raw != null ? Number.parseInt(raw, 10) : 100;
  const limit = Number.isFinite(n) ? Math.min(300, Math.max(1, n)) : 100;

  const result = await listOrderChatRoomsForAdmin(sb as import("@supabase/supabase-js").SupabaseClient<any>, {
    limit,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rooms: result.rooms });
}
