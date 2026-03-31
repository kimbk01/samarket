import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  patchCommunityChatRoom,
  type PatchCommunityChatRoomInput,
} from "@/lib/community-meeting-open-chat/admin-service";
import { isUserJoinedMeetingMember } from "@/lib/community-meeting-open-chat/meeting-member-guard";
import { getCommunityChatRoomInMeeting } from "@/lib/community-meeting-open-chat/rooms-service";
import {
  getCommunityChatRoomMeetingId,
  getJoinedCommunityChatMember,
} from "@/lib/community-meeting-open-chat/room-access";
import type { CommunityChatJoinType } from "@/lib/community-meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

function joinTypeFromPatch(v: unknown): CommunityChatJoinType | undefined {
  if (v === "public" || v === "password" || v === "approval") return v;
  return undefined;
}

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const allowed = await isUserJoinedMeetingMember(sb, mid, auth.userId);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const room = await getCommunityChatRoomInMeeting(sb, mid, rid);
  if (!room.ok) {
    const st = room.status === 404 ? 404 : room.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: room.error }, { status: st });
  }

  return NextResponse.json({ ok: true, room: room.room });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  if (!(await isUserJoinedMeetingMember(sb, mid, auth.userId))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const roomMeta = await getCommunityChatRoomMeetingId(sb, rid);
  if (!roomMeta.ok) {
    const st = roomMeta.status === 404 ? 404 : roomMeta.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: roomMeta.error }, { status: st });
  }
  if (roomMeta.meetingId !== mid) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const member = await getJoinedCommunityChatMember(sb, rid, auth.userId);
  if (!member.ok) {
    const st = member.status === 403 ? 403 : member.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: member.error }, { status: st });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: PatchCommunityChatRoomInput = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.description === "string") patch.description = body.description;
  if (body.thumbnailUrl === null || typeof body.thumbnailUrl === "string") {
    patch.thumbnailUrl = body.thumbnailUrl as string | null;
  }
  if (typeof body.maxMembers === "number") patch.maxMembers = body.maxMembers;
  if (typeof body.isSearchable === "boolean") patch.isSearchable = body.isSearchable;
  if (body.reportThreshold === null || typeof body.reportThreshold === "number") {
    patch.reportThreshold = body.reportThreshold as number | null;
  }
  const jt = joinTypeFromPatch(body.joinType);
  if (jt !== undefined) patch.joinType = jt;
  if (typeof body.joinPassword === "string") patch.joinPasswordPlain = body.joinPassword;

  const result = await patchCommunityChatRoom(sb, rid, auth.userId, member.member.role, patch);
  if (!result.ok) {
    const st =
      result.status === 400
        ? 400
        : result.status === 403
          ? 403
          : result.status === 404
            ? 404
            : result.status === 503
              ? 503
              : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  const room = await getCommunityChatRoomInMeeting(sb, mid, rid);
  if (!room.ok) {
    return NextResponse.json({ ok: true, room: null });
  }
  return NextResponse.json({ ok: true, room: room.room });
}
