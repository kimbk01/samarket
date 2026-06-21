import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { markRoomRead } from "@/lib/notifications/pipeline/notify-read-service";
import { fetchNotificationBadgeCount } from "@/lib/notifications/pipeline/notify-badge-service";
import { logNotifyOpen } from "@/lib/notifications/core/notification-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: { roomId?: string; categories?: string[]; readReason?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const roomId = String(body.roomId ?? "").trim();
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "room_id_required" }, { status: 400 });
  }

  const cleared = await markRoomRead(sb, userId, roomId);
  const badge = await fetchNotificationBadgeCount(sb, userId, { force: true });
  logNotifyOpen("room_opened", { userId, roomId, cleared });
  return NextResponse.json({
    ok: true,
    cleared,
    updatedNotificationEventCount: cleared,
    updatedParticipantUnreadCount: null,
    nextBadgeTotal: badge.total,
    categoryCounts: badge,
    threadUnreadAfter: null,
    nativeBadgeTotal: badge.total,
    affectedThreadId: roomId,
    readReason: body.readReason ?? "chat_room_visible",
  });
}
