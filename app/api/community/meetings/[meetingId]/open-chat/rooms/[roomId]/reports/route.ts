import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { listCommunityChatReports } from "@/lib/community-meeting-open-chat/moderation-service";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";
import { communityChatRoleCanManage } from "@/lib/community-meeting-open-chat/room-access";
import type { CommunityChatReportStatus } from "@/lib/community-meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

function statusParam(v: string | null): CommunityChatReportStatus | null {
  if (
    v === "pending" ||
    v === "dismissed" ||
    v === "action_blind" ||
    v === "action_kick" ||
    v === "action_ban"
  ) {
    return v;
  }
  return null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;

  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  if (!communityChatRoleCanManage(loaded.ctx.member.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = req.nextUrl.searchParams.get("status")?.trim() ?? "";
  const statusFilter = raw ? statusParam(raw) : null;
  if (raw && !statusFilter) {
    return NextResponse.json({ ok: false, error: "status_invalid" }, { status: 400 });
  }

  const list = await listCommunityChatReports(loaded.ctx.sb, loaded.ctx.roomId, statusFilter);
  if (!list.ok) {
    const st = list.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: list.error }, { status: st });
  }

  return NextResponse.json({ ok: true, reports: list.reports });
}
