/**
 * GET — 모임별 채팅 검토용 요약 (기본 방 + meeting_chat_rooms 부가 방)
 */
import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoomStat = {
  room_id: string;
  role: "main" | "extra";
  meeting_chat_room_id: string | null;
  title: string | null;
  is_private: boolean;
  is_readonly: boolean | null;
  is_locked: boolean | null;
  is_blocked: boolean | null;
  message_count: number;
  hidden_message_count: number;
  report_count: number;
  last_message_at: string | null;
};

async function countsForChatRoom(
  sb: ReturnType<typeof getSupabaseServer>,
  roomId: string,
): Promise<{ messages: number; hidden: number; reports: number; lastAt: string | null }> {
  const [msgRes, hidRes, repRes, lastRes] = await Promise.all([
    sb.from("chat_messages").select("id", { count: "exact", head: true }).eq("room_id", roomId),
    sb
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("is_hidden_by_admin", true),
    sb.from("chat_reports").select("id", { count: "exact", head: true }).eq("room_id", roomId),
    sb
      .from("chat_messages")
      .select("created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const msgC = msgRes.error ? 0 : msgRes.count;
  const hidC = hidRes.error ? 0 : hidRes.count;
  const repC = repRes.error ? 0 : repRes.count;
  const lastD = lastRes.data as { created_at?: string } | null;
  const lastAt = typeof lastD?.created_at === "string" ? lastD.created_at : null;
  return {
    messages: Number(msgC ?? 0),
    hidden: Number(hidC ?? 0),
    reports: Number(repC ?? 0),
    lastAt,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  const admin = await requireAdminApiUser();
  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: meet, error: meetErr } = await sb
    .from("meetings")
    .select("id, title, chat_room_id")
    .eq("id", id)
    .maybeSingle();
  if (meetErr || !meet) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const m = meet as { id: string; title?: string | null; chat_room_id?: string | null };
  const mainId = m.chat_room_id ? String(m.chat_room_id) : null;

  const rooms: RoomStat[] = [];
  let extraRoomCount = 0;
  let privateRoomCount = 0;
  let schemaNote: string | null = null;

  const roomFlags = async (roomIds: string[]) => {
    if (!roomIds.length)
      return new Map<string, { is_readonly: boolean | null; is_locked: boolean | null; is_blocked: boolean | null }>();
    const { data, error } = await sb
      .from("chat_rooms")
      .select("id, is_readonly, is_locked, is_blocked")
      .in("id", roomIds);
    const map = new Map<
      string,
      { is_readonly: boolean | null; is_locked: boolean | null; is_blocked: boolean | null }
    >();
    if (error || !data?.length) return map;
    for (const row of data as {
      id: string;
      is_readonly?: boolean | null;
      is_locked?: boolean | null;
      is_blocked?: boolean | null;
    }[]) {
      map.set(String(row.id), {
        is_readonly: row.is_readonly ?? null,
        is_locked: row.is_locked ?? null,
        is_blocked: row.is_blocked ?? null,
      });
    }
    return map;
  };

  if (mainId) {
    const c = await countsForChatRoom(sb, mainId);
    const flags = await roomFlags([mainId]);
    const f = flags.get(mainId);
    rooms.push({
      room_id: mainId,
      role: "main",
      meeting_chat_room_id: null,
      title: "전체 채팅",
      is_private: false,
      is_readonly: f?.is_readonly ?? null,
      is_locked: f?.is_locked ?? null,
      is_blocked: f?.is_blocked ?? null,
      message_count: c.messages,
      hidden_message_count: c.hidden,
      report_count: c.reports,
      last_message_at: c.lastAt,
    });
  }

  const { data: extras, error: exErr } = await sb
    .from("meeting_chat_rooms")
    .select("id, title, is_private, linked_chat_room_id, created_at")
    .eq("meeting_id", id)
    .order("created_at", { ascending: true });

  if (exErr) {
    const msg = String(exErr.message ?? "");
    if ((exErr as { code?: string }).code === "42P01" || msg.includes("does not exist")) {
      schemaNote = "meeting_chat_rooms 테이블 없음 — 20260331150000 마이그레이션 적용 필요";
    }
  } else if (extras?.length) {
    const extraRows = extras as {
      id: string;
      title?: string;
      is_private?: boolean;
      linked_chat_room_id: string;
    }[];
    const linkedIds = extraRows.map((r) => String(r.linked_chat_room_id ?? "")).filter(Boolean);
    const flagsMap = await roomFlags(linkedIds);

    for (const row of extraRows) {
      extraRoomCount += 1;
      if (row.is_private) privateRoomCount += 1;
      const lid = String(row.linked_chat_room_id ?? "");
      if (!lid) continue;
      const c = await countsForChatRoom(sb, lid);
      const f = flagsMap.get(lid);
      rooms.push({
        room_id: lid,
        role: "extra",
        meeting_chat_room_id: String(row.id),
        title: String(row.title ?? ""),
        is_private: !!row.is_private,
        is_readonly: f?.is_readonly ?? null,
        is_locked: f?.is_locked ?? null,
        is_blocked: f?.is_blocked ?? null,
        message_count: c.messages,
        hidden_message_count: c.hidden,
        report_count: c.reports,
        last_message_at: c.lastAt,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    meeting_id: m.id,
    meeting_title: String(m.title ?? ""),
    main_chat_room_id: mainId,
    extra_room_count: extraRoomCount,
    private_room_count: privateRoomCount,
    total_linked_rooms: rooms.length,
    rooms,
    schema_note: schemaNote,
  });
}
