import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";
import { submitCommunityChatMessageReport } from "@/lib/community-meeting-open-chat/moderation-service";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; messageId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, messageId } = await ctx.params;
  const mid = messageId?.trim() ?? "";
  if (!mid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  let body: { category?: string; detail?: string };
  try {
    body = (await req.json()) as { category?: string; detail?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await submitCommunityChatMessageReport(
    loaded.ctx.sb,
    loaded.ctx.roomId,
    mid,
    auth.userId,
    typeof body.category === "string" ? body.category : "",
    typeof body.detail === "string" ? body.detail : ""
  );

  if (!result.ok) {
    const st =
      result.status === 400
        ? 400
        : result.status === 404
          ? 404
          : result.status === 409
            ? 409
            : result.status === 503
              ? 503
              : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true, reportId: result.reportId });
}
