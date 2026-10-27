import { NextRequest, NextResponse } from "next/server";
import {
  markCampaignDeliveryDismissed,
  markCampaignDeliveryOpened,
} from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { markNotificationRead } from "@/lib/notifications/pipeline/notify-read-service";
import {
  domainBadgeReadMutationAckFields,
  issueDomainBadgeAuthorityForAck,
} from "@/lib/notifications/pipeline/domain-badge-read-ack";
import { logNotifyOpen } from "@/lib/notifications/core/notification-logs";
import { isMemberNotificationAListItem } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";

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

  let body: {
    notificationEventId?: string;
    opened?: boolean;
    dismissed?: boolean;
    requireMemberA?: boolean;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventId = String(body.notificationEventId ?? "").trim();
  if (!eventId) {
    return NextResponse.json({ ok: false, error: "notification_event_id_required" }, { status: 400 });
  }

  if (body.requireMemberA === true) {
    // F2 보완 (docs/audit/notification-f2-android-tap-read-fix-design-2026-10-28.md A): 종류를 모르는 푸시 탭 —
    // 종(A) 숫자와 같은 기준을 통과한 본인 알림만 읽음. 채팅(B)·오너 운영은 쓰기 없이 거절.
    const { data: row, error: rowErr } = await sb
      .from("notification_events")
      .select("id, user_id, type, category, unread, read_at, room_id, dedupe_key, muted_snapshot, display_payload")
      .eq("id", eventId)
      .eq("user_id", userId)
      .maybeSingle();
    if (rowErr || !row || !isMemberNotificationAListItem(row)) {
      return NextResponse.json({ ok: false, skipped: "not_member_a" });
    }
  }

  const ok = await markNotificationRead(sb, userId, eventId, { openedAt: body.opened === true });
  if (!ok) {
    return NextResponse.json({ ok: false });
  }
  if (body.dismissed === true) {
    await markCampaignDeliveryDismissed(sb, eventId);
  } else if (body.opened === true) {
    await markCampaignDeliveryOpened(sb, eventId);
  }
  logNotifyOpen(body.dismissed === true ? "dismissed" : "read_marked", {
    userId,
    notificationEventId: eventId,
  });
  /** P3-a: Generation Owner — one Domain rebuild on ACK. */
  const domain = await issueDomainBadgeAuthorityForAck(sb, userId);
  return NextResponse.json({
    ok: true,
    ...domainBadgeReadMutationAckFields(domain),
  });
}
