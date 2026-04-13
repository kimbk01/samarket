import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * GET — 일자리 글의 전화번호(채팅 참가자·채팅방 한정, phone_allowed일 때만)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { parsePostMetaField } from "@/lib/chats/chat-product-from-post";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const { roomId: rawId } = await context.params;
  const roomId = typeof rawId === "string" ? rawId.trim() : "";
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }
  const sbAny = sb as any;

  const access = await assertVerifiedMemberForAction(sbAny, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { data: room } = await sbAny
    .from("chat_rooms")
    .select("id, room_type, item_id, seller_id, buyer_id")
    .eq("id", roomId)
    .maybeSingle();

  const r = room as {
    room_type?: string;
    item_id?: string | null;
    seller_id?: string | null;
    buyer_id?: string | null;
  } | null;

  if (!r || r.room_type !== "item_trade" || !r.item_id?.trim()) {
    return NextResponse.json({ ok: false, error: "일자리 문의가 아닙니다." }, { status: 404 });
  }

  const { data: part } = await sbAny
    .from("chat_room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!part?.id) {
    return NextResponse.json({ ok: false, error: "참가자만 볼 수 있습니다." }, { status: 403 });
  }

  const sid = (r.seller_id ?? "").trim();
  const bid = (r.buyer_id ?? "").trim();
  if (userId !== sid && userId !== bid) {
    return NextResponse.json({ ok: false, error: "참가자만 볼 수 있습니다." }, { status: 403 });
  }

  const { data: post } = await sbAny.from(POSTS_TABLE_READ).select("meta").eq("id", r.item_id).maybeSingle();
  const meta = parsePostMetaField((post as { meta?: unknown } | null)?.meta);
  if (String(meta.trade_chat_kind ?? "").toLowerCase() !== "job") {
    return NextResponse.json({ ok: false, error: "일자리 글이 아닙니다." }, { status: 404 });
  }

  const phoneAllowed = meta.phone_allowed === true;
  const phoneRaw = typeof meta.contact_phone === "string" ? meta.contact_phone.trim() : "";
  if (!phoneAllowed || !phoneRaw) {
    return NextResponse.json({ ok: true, disclosed: false, phone: null });
  }

  return NextResponse.json({ ok: true, disclosed: true, phone: phoneRaw });
}
