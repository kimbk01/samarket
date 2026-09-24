import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  claimCommercePushHandoffEvents,
  processClaimedCommercePushHandoff,
} from "@/lib/notifications/commerce-notification-push-handoff";
import { reconcileCommerceNotificationIntentsFromStoreOrderEvents } from "@/lib/notifications/commerce-notification-reconcile";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SR-1 P2 retry owner:
 * 1) reconcile missing commerce intents from store_order_events (W1)
 * 2) claim + dispatch pending/retryable push handoffs (W2b/W3)
 */
async function runCommerceNotificationPushHandoff(req: Request) {
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

  const reconcile = await reconcileCommerceNotificationIntentsFromStoreOrderEvents(sb, {
    lookbackMinutes: 180,
    limit: 50,
  });

  const claimToken = `cph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const claimed = await claimCommercePushHandoffEvents(sb, { limit: 20, claimToken });
  const results: Array<{ id: string; result: string }> = [];
  for (const row of claimed) {
    const withToken = { ...row, _claimToken: claimToken } as NotificationEventRow & {
      _claimToken?: string;
    };
    const result = await processClaimedCommercePushHandoff(sb, withToken);
    results.push({ id: row.id, result });
  }

  return NextResponse.json({
    ok: true,
    reconcile,
    claimed: claimed.length,
    results,
  });
}

export async function GET(req: Request) {
  return runCommerceNotificationPushHandoff(req);
}

export async function POST(req: Request) {
  return runCommerceNotificationPushHandoff(req);
}
