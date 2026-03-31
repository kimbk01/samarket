/**
 * GET /api/admin/chat/meeting-open-rooms — 모임 LINE형 오픈채팅 방 목록 (관리자)
 * Query: limit, hasReport
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const sbAny = sb;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 200);
  const hasReport = req.nextUrl.searchParams.get("hasReport") === "true";

  const { data: rooms, error } = await sbAny
    .from("meeting_open_chat_rooms")
    .select(
      "id, meeting_id, title, thumbnail_url, owner_user_id, last_message_preview, last_message_at, active_member_count, is_active, created_at"
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (rooms ?? []) as {
    id: string;
    meeting_id: string;
    title: string;
    thumbnail_url: string | null;
    owner_user_id: string;
    last_message_preview: string | null;
    last_message_at: string | null;
    active_member_count: number;
    is_active: boolean;
    created_at: string;
  }[];

  const roomIds = list.map((r) => r.id);
  const reportCountByRoomId: Record<string, number> = {};
  if (roomIds.length > 0) {
    const { data: reportRows } = await sbAny
      .from("meeting_open_chat_reports")
      .select("room_id")
      .in("room_id", roomIds);
    (reportRows ?? []).forEach((row: { room_id: string | null }) => {
      if (row.room_id) {
        reportCountByRoomId[row.room_id] = (reportCountByRoomId[row.room_id] ?? 0) + 1;
      }
    });
  }

  let filtered = list;
  if (hasReport) {
    filtered = list.filter((r) => (reportCountByRoomId[r.id] ?? 0) > 0);
  }

  const ownerIds = [...new Set(filtered.map((r) => r.owner_user_id).filter(Boolean))];
  const nickMap = ownerIds.length ? await fetchNicknamesForUserIds(sbAny, ownerIds) : new Map<string, string>();

  const meetingIds = [...new Set(filtered.map((r) => r.meeting_id))];
  let meetingTitleById: Record<string, string> = {};
  if (meetingIds.length > 0) {
    const { data: meetings } = await sbAny.from("meetings").select("id, title").in("id", meetingIds);
    meetingTitleById = (meetings ?? []).reduce(
      (acc: Record<string, string>, m: { id: string; title?: string | null }) => {
        acc[m.id] = (m.title ?? "").trim();
        return acc;
      },
      {}
    );
  }

  const rows = filtered.map((r) => {
    const meetingTitle = meetingTitleById[r.meeting_id] ?? "";
    const ownerNick = nickMap.get(r.owner_user_id) ?? r.owner_user_id.slice(0, 8);
    return {
      id: r.id,
      meeting_id: r.meeting_id,
      meetingTitle,
      title: r.title,
      thumbnail_url: r.thumbnail_url,
      owner_user_id: r.owner_user_id,
      ownerNickname: ownerNick,
      last_message_preview: r.last_message_preview,
      last_message_at: r.last_message_at,
      active_member_count: r.active_member_count,
      is_active: r.is_active,
      created_at: r.created_at,
      reportCount: reportCountByRoomId[r.id] ?? 0,
    };
  });

  return NextResponse.json({ rooms: rows });
}
