import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  claimChatPushHandoffEvents,
  processClaimedChatPushHandoff,
} from "@/lib/notifications/chat-notification-push-handoff";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WP-7 NEW-24 + NOTI-08 — 채팅/부재중 푸시 복구.
 * route after() 가 보내지 못한(죽음/일시 실패) 채팅 푸시를 grace(90s) 뒤 주워 재전송한다.
 * 만료(일반 10분·통화 1시간)된 것은 보내지 않고 정리한다. 새 테이블/큐 없음 — 기존
 * notification_events push_handoff_* 컬럼 + 일반화된 claim RPC 재사용.
 */
async function runNotificationPushHandoff(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const claimToken = `cph2_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const claimed = await claimChatPushHandoffEvents(sb, { limit: 40, claimToken });
  const results: Array<{ id: string; result: string }> = [];
  for (const row of claimed) {
    const withToken = { ...row, _claimToken: claimToken } as NotificationEventRow & {
      _claimToken?: string;
    };
    const result = await processClaimedChatPushHandoff(sb, withToken);
    results.push({ id: row.id, result });
  }

  return NextResponse.json({ ok: true, claimed: claimed.length, results });
}

export async function GET(req: Request) {
  return runNotificationPushHandoff(req);
}

export async function POST(req: Request) {
  return runNotificationPushHandoff(req);
}
