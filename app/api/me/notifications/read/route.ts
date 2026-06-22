import { NextRequest, NextResponse } from "next/server";
import {
  markCampaignDeliveryDismissed,
  markCampaignDeliveryOpened,
} from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { markNotificationRead } from "@/lib/notifications/pipeline/notify-read-service";
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

  let body: { notificationEventId?: string; opened?: boolean; dismissed?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventId = String(body.notificationEventId ?? "").trim();
  if (!eventId) {
    return NextResponse.json({ ok: false, error: "notification_event_id_required" }, { status: 400 });
  }

  const ok = await markNotificationRead(sb, userId, eventId, { openedAt: body.opened === true });
  if (ok) {
    if (body.dismissed === true) {
      await markCampaignDeliveryDismissed(sb, eventId);
    } else if (body.opened === true) {
      await markCampaignDeliveryOpened(sb, eventId);
    }
    logNotifyOpen(body.dismissed === true ? "dismissed" : "read_marked", {
      userId,
      notificationEventId: eventId,
    });
  }
  return NextResponse.json({ ok });
}
