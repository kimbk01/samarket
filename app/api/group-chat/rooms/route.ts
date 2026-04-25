/**
 * POST /api/group-chat/rooms — 그룹 방 생성 (소유자 멤버십 자동)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { jsonError, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("서버 설정 필요", 500);
  }

  const parsed = await parseJsonBody<{ title?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const title = typeof parsed.value.title === "string" ? parsed.value.title.trim().slice(0, 200) : "";

  const { data: room, error: roomErr } = await sb
    .from("group_rooms")
    .insert({
      title: title || "그룹 채팅",
      created_by: auth.userId,
    })
    .select("id, title, created_at, message_seq, member_count, last_message_at, last_message_preview")
    .single();

  if (roomErr || !room) {
    return jsonError(roomErr?.message ?? "방을 만들지 못했습니다.", 500);
  }

  const rid = (room as { id: string }).id;

  const { error: memErr } = await sb.from("group_room_members").insert({
    room_id: rid,
    user_id: auth.userId,
    role: "owner",
  });

  if (memErr) {
    await sb.from("group_rooms").delete().eq("id", rid);
    return jsonError(memErr.message, 500);
  }

  await sb.from("group_rooms").update({ member_count: 1, updated_at: new Date().toISOString() }).eq("id", rid);

  return NextResponse.json({
    ok: true,
    room: {
      id: rid,
      title: (room as { title?: string }).title ?? "",
      createdAt: (room as { created_at?: string }).created_at,
      messageSeq: (room as { message_seq?: number }).message_seq ?? 0,
      memberCount: 1,
    },
  });
}
