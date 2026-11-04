import { NextRequest, NextResponse } from "next/server";
import {
  markCampaignDeliveryDismissed,
  markCampaignDeliveryOpened,
} from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { markNotificationRead } from "@/lib/notifications/pipeline/notify-read-service";
import { patchInboxNotificationIdsRead } from "@/lib/notifications/inbox-read-bridge";
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

  // C4 읽음 계약: 푸시 탭(열기)은 종·전체 목록·앱 안 배너 탭과 **같은 함수**로 읽음 처리한다 → 같은 이벤트 = 같은 결과.
  // (이전: 푸시 탭은 1건만, 목록 탭은 글·주문·상품 단위로 달라 종 숫자가 화면마다 다르게 남았다.)
  // 스와이프로 닫은 경우(dismissed)는 열지 않았으므로 그 1건만.
  let ok: boolean;
  if (body.opened === true && body.dismissed !== true) {
    const patched = await patchInboxNotificationIdsRead(sb, userId, [eventId]);
    ok = patched.ok && patched.updated > 0;
  } else {
    ok = await markNotificationRead(sb, userId, eventId, { openedAt: body.opened === true });
  }
  if (!ok) {
    // 최종 감사 E-1 — 알림함에서 이미 읽은 알림(「모두 읽음」 등)의 푸시를 눌러도 회원이 연 것이다.
    // 읽음은 바뀌지 않지만(그래서 ok:false) 운영자 알림 열람은 남긴다. 본인 알림일 때만(발송 기록이 회원 단위로 걸러짐).
    if (body.opened === true && body.dismissed !== true) {
      await markCampaignDeliveryOpened(sb, eventId, userId);
    }
    return NextResponse.json({ ok: false });
  }
  if (body.dismissed === true) {
    await markCampaignDeliveryDismissed(sb, eventId, userId);
  } else if (body.opened === true) {
    await markCampaignDeliveryOpened(sb, eventId, userId);
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
