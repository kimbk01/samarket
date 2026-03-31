import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isUserJoinedMeetingMember } from "@/lib/community-meeting-open-chat/meeting-member-guard";
import { leaveMeetingOpenChatRoom } from "@/lib/meeting-open-chat/rooms-service";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
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

  const result = await leaveMeetingOpenChatRoom(sb, {
    meetingId: mid,
    roomId: rid,
    userId: auth.userId,
  });

  if (!result.ok) {
    const st =
      result.status === 403
        ? 403
        : result.status === 404
          ? 404
          : result.status === 503
            ? 503
            : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
