import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isUserJoinedMeetingMember } from "@/lib/meeting-open-chat/meeting-member-guard";
import { joinMeetingOpenChatRoom } from "@/lib/meeting-open-chat/rooms-service";
import type { MeetingOpenChatJoinAs } from "@/lib/meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

function joinAsFromBody(v: unknown): MeetingOpenChatJoinAs | null {
  if (v === "realname" || v === "nickname") return v;
  return null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const result = await joinMeetingOpenChatRoom(sb, {
    meetingId: mid,
    roomId: rid,
    userId: auth.userId,
    joinAs: joinAsFromBody(body.joinAs),
    openNickname: typeof body.openNickname === "string" ? body.openNickname : "",
    openProfileImageUrl: typeof body.openProfileImageUrl === "string" ? body.openProfileImageUrl : null,
    introMessage: typeof body.introMessage === "string" ? body.introMessage : null,
    joinPasswordPlain: typeof body.joinPassword === "string" ? body.joinPassword : null,
  });

  if (!result.ok) {
    const st =
      result.status === 400
        ? 400
        : result.status === 403
          ? 403
          : result.status === 404
            ? 404
            : result.status === 409
              ? 409
              : result.status === 501
                ? 501
                : result.status === 503
                  ? 503
                  : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  if ("pendingApproval" in result && result.pendingApproval) {
    return NextResponse.json({
      ok: true,
      joined: false,
      pendingApproval: true,
      requestId: result.requestId,
    });
  }

  return NextResponse.json({ ok: true, joined: true });
}
