import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";
import { setMeetingOpenChatMemberRole } from "@/lib/meeting-open-chat/moderation-service";
import type { MeetingOpenChatMemberRole } from "@/lib/meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; memberId: string }> };

function newRoleFromBody(v: unknown): "sub_admin" | "member" | null {
  if (v === "sub_admin" || v === "member") return v;
  return null;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, memberId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  const targetMemberId = memberId?.trim() ?? "";
  if (!mid || !rid || !targetMemberId) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const newRole = newRoleFromBody(body.role);
  if (!newRole) {
    return NextResponse.json({ ok: false, error: "role_invalid" }, { status: 400 });
  }

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const role = loaded.ctx.member.role as MeetingOpenChatMemberRole;
  const result = await setMeetingOpenChatMemberRole(loaded.ctx.sb, {
    roomId: rid,
    actorUserId: auth.userId,
    actorRole: role,
    targetMemberId,
    newRole,
  });

  if (!result.ok) {
    const st =
      result.status === 400
        ? 400
        : result.status === 403
          ? 403
          : result.status === 503
            ? 503
            : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
