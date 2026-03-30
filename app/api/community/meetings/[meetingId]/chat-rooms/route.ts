import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createMeetingExtraChatRoom,
  ensureMeetingGroupChatRoom,
  listMeetingExtraChatRoomsForUser,
} from "@/lib/neighborhood/meeting-chat";
import { getNeighborhoodDevSampleMeeting, getNeighborhoodDevSampleMeetingMembers } from "@/lib/neighborhood/dev-sample-data";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer> | null = null;
  try {
    sb = getSupabaseServer();
  } catch {
    sb = null;
  }

  if (process.env.NODE_ENV !== "production") {
    const sampleMeeting = getNeighborhoodDevSampleMeeting(id);
    if (sampleMeeting) {
      const dbBacked =
        sb != null &&
        (await sb.from("meetings").select("id").eq("id", id).maybeSingle()).data != null;
      // 인메모리 전용 샘플만 예전처럼 데모 목록. DB에 같은 id 가 있으면(시드 샘플 포함) 아래 실제 조회로 진행
      if (!dbBacked) {
        const members = getNeighborhoodDevSampleMeetingMembers(id);
        const joined = members.some((m) => m.user_id === auth.userId && m.status === "joined");
        if (!joined) {
          return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        return NextResponse.json({
          ok: true,
          mainChatRoomId: sampleMeeting.chat_room_id ?? null,
          extraRooms: [] as [],
          useClientDemoExtras: true,
        });
      }
    }
  }

  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: mm } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", id)
    .eq("user_id", auth.userId)
    .eq("status", "joined")
    .maybeSingle();
  if (!mm) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const extraRooms = await listMeetingExtraChatRoomsForUser(sb, id, auth.userId);
    const { data: meet } = await sb
      .from("meetings")
      .select("chat_room_id, title, host_user_id, created_by")
      .eq("id", id)
      .maybeSingle();
    let mainChatRoomId =
      (meet as { chat_room_id?: string | null } | null)?.chat_room_id != null
        ? String((meet as { chat_room_id: string }).chat_room_id)
        : null;
    if (!mainChatRoomId) {
      const meetTitle = String((meet as { title?: string | null } | null)?.title ?? "").trim() || "모임";
      const organizer = String(
        (meet as { host_user_id?: string | null; created_by?: string | null } | null)?.host_user_id ??
          (meet as { created_by?: string | null } | null)?.created_by ??
          auth.userId,
      ).trim();
      const ensured = await ensureMeetingGroupChatRoom(sb, id, organizer || auth.userId, meetTitle);
      if (ensured?.roomId) mainChatRoomId = ensured.roomId;
    }
    return NextResponse.json({ ok: true, mainChatRoomId, extraRooms, useClientDemoExtras: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "SCHEMA_MISSING" || msg.includes("meeting_chat_rooms") || msg.includes("42P01")) {
      /** `meeting_chat_rooms` 미적용 환경: 메인 방(`meetings.chat_room_id`)만 반환 */
      const { data: meet } = await sb
        .from("meetings")
        .select("chat_room_id, title, host_user_id, created_by")
        .eq("id", id)
        .maybeSingle();
      let mainChatRoomId =
        (meet as { chat_room_id?: string | null } | null)?.chat_room_id != null
          ? String((meet as { chat_room_id: string }).chat_room_id)
          : null;
      if (!mainChatRoomId) {
        const meetTitle = String((meet as { title?: string | null } | null)?.title ?? "").trim() || "모임";
        const organizer = String(
          (meet as { host_user_id?: string | null; created_by?: string | null } | null)?.host_user_id ??
            (meet as { created_by?: string | null } | null)?.created_by ??
            auth.userId,
        ).trim();
        const ensured = await ensureMeetingGroupChatRoom(sb, id, organizer || auth.userId, meetTitle);
        if (ensured?.roomId) mainChatRoomId = ensured.roomId;
      }
      return NextResponse.json({
        ok: true,
        mainChatRoomId,
        extraRooms: [] as [],
        useClientDemoExtras: false,
        extraRoomsUnavailable: true,
      });
    }
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSampleMeeting(id)) {
    const { data: dbMeet } = await sb.from("meetings").select("id").eq("id", id).maybeSingle();
    if (!dbMeet) {
      return NextResponse.json({ ok: false, error: "sample_readonly" }, { status: 400 });
    }
  }

  let body: {
    title?: string;
    description?: string | null;
    kind?: string;
    participantUserIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description =
    body.description == null ? null : String(body.description).trim().slice(0, 500) || null;
  const kindRaw = String(body.kind ?? "");
  const kind =
    kindRaw === "sub_all" || kindRaw === "sub_selected" || kindRaw === "private_selected"
      ? kindRaw
      : null;
  const participantUserIds = Array.isArray(body.participantUserIds)
    ? body.participantUserIds.map((u) => String(u).trim()).filter(Boolean)
    : [];

  if (!title || !kind) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await createMeetingExtraChatRoom(sb, {
      meetingId: id,
      createdByUserId: auth.userId,
      title,
      description,
      kind,
      selectedUserIds: participantUserIds,
    });
    if (!result.ok) {
      const st =
        result.error === "not_found"
          ? 404
          : result.error === "forbidden"
            ? 403
            : result.error === "bad_request"
              ? 400
              : 500;
      return NextResponse.json(
        { ok: false, error: result.error, message: result.message },
        { status: st },
      );
    }
    return NextResponse.json({ ok: true, meetingChatRoom: result.meetingChatRoom });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("meeting_chat_rooms") || msg.includes("42P01")) {
      return NextResponse.json(
        { ok: false, error: "schema_missing", message: "meeting_chat_rooms 마이그레이션을 적용하세요." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
