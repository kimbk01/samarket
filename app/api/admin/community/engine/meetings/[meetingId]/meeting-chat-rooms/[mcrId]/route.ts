/**
 * DELETE — 모임 부가 채팅(meeting_chat_rooms) 및 연결된 chat_rooms 정리 (기본 전체 채팅은 불가)
 */
import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

async function deleteLinkedChatRoom(
  sb: ReturnType<typeof getSupabaseServer>,
  linkedChatRoomId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const roomId = linkedChatRoomId;
  const db = sb as any;

  const tryDelete = async (table: string, col: string) => {
    const { error } = await db.from(table).delete().eq(col, roomId);
    if (error && !/does not exist|42P01/i.test(String(error.message ?? ""))) {
      return error.message as string;
    }
    return null;
  };

  const steps: [string, string][] = [
    ["chat_messages", "room_id"],
    ["chat_room_participants", "room_id"],
    ["chat_reports", "room_id"],
    ["chat_event_logs", "room_id"],
  ];
  for (const [t, c] of steps) {
    const err = await tryDelete(t, c);
    if (err) return { ok: false, error: `${t}: ${err}` };
  }

  const modDel = await db
    .from("moderation_actions")
    .delete()
    .eq("target_type", "room")
    .eq("target_id", roomId);
  if (modDel.error && !/does not exist|42P01/i.test(String(modDel.error.message ?? ""))) {
    return { ok: false, error: `moderation_actions: ${modDel.error.message}` };
  }

  const { error: crErr } = await db.from("chat_rooms").delete().eq("id", roomId);
  if (crErr) {
    return { ok: false, error: crErr.message ?? "chat_rooms 삭제 실패" };
  }
  return { ok: true };
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ meetingId: string; mcrId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { meetingId, mcrId } = await ctx.params;
  const mid = meetingId?.trim();
  const metaId = mcrId?.trim();
  if (!mid || !metaId) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: meet, error: meetErr } = await sb
    .from("meetings")
    .select("id, chat_room_id")
    .eq("id", mid)
    .maybeSingle();
  if (meetErr || !meet) {
    return NextResponse.json({ ok: false, error: "meeting_not_found" }, { status: 404 });
  }
  const mainChatId = (meet as { chat_room_id?: string | null }).chat_room_id
    ? String((meet as { chat_room_id: string }).chat_room_id)
    : null;

  const { data: mcr, error: mcrErr } = await sb
    .from("meeting_chat_rooms")
    .select("id, meeting_id, linked_chat_room_id")
    .eq("id", metaId)
    .eq("meeting_id", mid)
    .maybeSingle();

  if (mcrErr) {
    const msg = String(mcrErr.message ?? "");
    if (mcrErr.code === "42P01" || msg.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "schema_missing", detail: msg }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  if (!mcr) {
    return NextResponse.json({ ok: false, error: "meeting_chat_room_not_found" }, { status: 404 });
  }

  const linked = String((mcr as { linked_chat_room_id: string }).linked_chat_room_id ?? "");
  if (!linked) {
    return NextResponse.json({ ok: false, error: "invalid_link" }, { status: 400 });
  }
  if (mainChatId && linked === mainChatId) {
    return NextResponse.json({ ok: false, error: "cannot_delete_main_chat" }, { status: 400 });
  }

  const result = await deleteLinkedChatRoom(sb, linked);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted_linked_chat_room_id: linked });
}
