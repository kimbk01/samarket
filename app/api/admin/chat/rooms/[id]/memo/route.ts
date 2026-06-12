import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveChatRoomId } from "@/lib/admin-chats/resolve-chat-room-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  const { id: paramId } = await params;
  const roomId = await resolveChatRoomId(sb, paramId.trim());
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "room_not_found" }, { status: 404 });
  }

  let body: { memo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const memo = typeof body.memo === "string" ? body.memo.trim().slice(0, 2000) : "";
  const db = sb as import("@supabase/supabase-js").SupabaseClient;

  const { error } = await db
    .from("chat_rooms")
    .update({ admin_memo: memo, updated_at: new Date().toISOString() })
    .eq("id", roomId);

  if (error) {
    if (/admin_memo|does not exist/i.test(error.message)) {
      return NextResponse.json({ ok: false, error: "migration_required" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, adminMemo: memo });
}
