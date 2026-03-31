import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveCommunityChatReport } from "@/lib/community-meeting-open-chat/moderation-service";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";
import type { CommunityChatReportStatus } from "@/lib/community-meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; reportId: string }> };

function resolutionStatus(v: unknown): CommunityChatReportStatus | null {
  if (
    v === "dismissed" ||
    v === "action_blind" ||
    v === "action_kick" ||
    v === "action_ban"
  ) {
    return v;
  }
  return null;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, reportId } = await ctx.params;
  const repId = reportId?.trim() ?? "";
  if (!repId) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  let body: { status?: unknown; resolutionNote?: string | null; banUntil?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const st = resolutionStatus(body.status);
  if (!st) {
    return NextResponse.json({ ok: false, error: "status_invalid" }, { status: 400 });
  }

  const result = await resolveCommunityChatReport(loaded.ctx.sb, loaded.ctx.roomId, repId, auth.userId, loaded.ctx.member.role, {
    status: st,
    resolutionNote: typeof body.resolutionNote === "string" ? body.resolutionNote : null,
    banUntilIso: body.banUntil === null || typeof body.banUntil === "string" ? body.banUntil ?? null : null,
  });

  if (!result.ok) {
    const stHttp =
      result.status === 400
        ? 400
        : result.status === 403
          ? 403
          : result.status === 404
            ? 404
            : result.status === 503
              ? 503
              : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: stHttp });
  }

  return NextResponse.json({ ok: true });
}
