import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isUserJoinedMeetingMember } from "@/lib/community-meeting-open-chat/meeting-member-guard";
import { fetchViewerSuggestedOpenNickname } from "@/lib/meeting-open-chat/fetch-viewer-suggested-open-nickname";
import { getActiveMeetingOpenChatMember } from "@/lib/meeting-open-chat/room-access";
import { getMeetingOpenChatUnreadOthersCount } from "@/lib/meeting-open-chat/read-service";
import {
  getMeetingOpenChatRoomInMeeting,
  patchMeetingOpenChatRoom,
  type PatchMeetingOpenChatRoomInput,
} from "@/lib/meeting-open-chat/rooms-service";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

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

  const room = await getMeetingOpenChatRoomInMeeting(sb, mid, rid);
  if (!room.ok) {
    const st = room.status === 404 ? 404 : room.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: room.error }, { status: st });
  }

  const member = await getActiveMeetingOpenChatMember(sb, rid, auth.userId);
  const chatMember = member.ok
    ? {
        memberId: member.member.memberId,
        role: member.member.role,
        openNickname: member.member.open_nickname,
        openProfileImageUrl: member.member.open_profile_image_url,
      }
    : null;

  let viewerUnreadCount = 0;
  if (chatMember) {
    const ur = await getMeetingOpenChatUnreadOthersCount(sb, rid, auth.userId);
    if (ur.ok) viewerUnreadCount = ur.count;
  }

  const viewerSuggestedOpenNickname = chatMember ? null : await fetchViewerSuggestedOpenNickname(sb, auth.userId);

  return NextResponse.json({
    ok: true,
    room: room.room,
    chatMember,
    viewerUnreadCount,
    viewerSuggestedOpenNickname,
  });
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: PatchMeetingOpenChatRoomInput = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.description === "string") patch.description = body.description;
  if (body.thumbnailUrl === null || typeof body.thumbnailUrl === "string") {
    patch.thumbnailUrl = body.thumbnailUrl as string | null;
  }
  if (typeof body.maxMembers === "number") patch.maxMembers = body.maxMembers;
  if (typeof body.isSearchable === "boolean") patch.isSearchable = body.isSearchable;
  if (typeof body.allowRejoinAfterKick === "boolean") patch.allowRejoinAfterKick = body.allowRejoinAfterKick;
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

  const result = await patchMeetingOpenChatRoom(sb, mid, rid, auth.userId, patch);
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

  return NextResponse.json({ ok: true, room: result.room });
}
