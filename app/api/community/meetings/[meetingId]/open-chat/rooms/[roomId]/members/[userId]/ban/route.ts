import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { banCommunityChatMember } from "@/lib/community-meeting-open-chat/moderation-service";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; userId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, userId: targetUserId } = await ctx.params;
  const tid = targetUserId?.trim() ?? "";
  if (!tid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  let body: { reason?: string; banUntil?: string | null };
  try {
    body = (await req.json().catch(() => ({}))) as { reason?: string; banUntil?: string | null };
  } catch {
    body = {};
  }

  const result = await banCommunityChatMember(
    loaded.ctx.sb,
    loaded.ctx.roomId,
    tid,
    auth.userId,
    loaded.ctx.member.role,
    typeof body.reason === "string" ? body.reason : "",
    body.banUntil === null || typeof body.banUntil === "string" ? body.banUntil ?? null : null
  );

  if (!result.ok) {
    const st =
      result.status === 400
        ? 400
        : result.status === 403
          ? 403
          : result.status === 409
            ? 409
            : result.status === 503
              ? 503
              : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
