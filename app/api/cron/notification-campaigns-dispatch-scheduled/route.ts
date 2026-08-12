import { NextResponse } from "next/server";
import {
  claimDueOccurrence,
  getCampaignOccurrence,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import {
  drainNotificationCampaignSendBatches,
  newCampaignSendClaimToken,
  scheduleNextRecurringOccurrence,
} from "@/lib/admin/notification-campaigns/claim-scheduled-campaign";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_OCCURRENCES_PER_TICK = 3;
const MAX_BATCHES_PER_OCCURRENCE = 25;
const MAX_WALL_MS_PER_OCCURRENCE = 45_000;

async function runDispatchScheduled(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const results: Array<{
    occurrenceId: string;
    campaignId: string;
    ok: boolean;
    done: boolean;
    batches: number;
    sent: number;
    skipped: number;
    failed: number;
    error?: string;
  }> = [];

  for (let i = 0; i < MAX_OCCURRENCES_PER_TICK; i += 1) {
    const claimToken = newCampaignSendClaimToken();
    const claimed = await claimDueOccurrence(svc, { claimToken });
    if (!claimed?.id) break;

    const drained = await drainNotificationCampaignSendBatches(svc, claimed.id, {
      maxBatches: MAX_BATCHES_PER_OCCURRENCE,
      maxWallMs: MAX_WALL_MS_PER_OCCURRENCE,
    });

    if (!drained.ok) {
      await svc
        .from("admin_notification_campaign_occurrences")
        .update({
          last_error: drained.error ?? "batch_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);
    }

    results.push({
      occurrenceId: claimed.id,
      campaignId: claimed.campaign_id,
      ok: drained.ok,
      done: drained.done,
      batches: drained.batches,
      sent: drained.sent,
      skipped: drained.skipped,
      failed: drained.failed,
      error: drained.error,
    });

    if (drained.done) {
      const occ = await getCampaignOccurrence(svc, claimed.id);
      if (occ?.trigger_type === "recurring") {
        await scheduleNextRecurringOccurrence(svc, occ.campaign_id);
      }
    }
  }

  const { data: activeRecurring } = await svc
    .from("admin_notification_campaigns")
    .select("id")
    .eq("send_mode", "recurring")
    .eq("status", "active")
    .limit(20);

  for (const row of activeRecurring ?? []) {
    const campaignId = String((row as { id: string }).id);
    const { count } = await svc
      .from("admin_notification_campaign_occurrences")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["queued", "sending"]);
    if ((count ?? 0) === 0) {
      await scheduleNextRecurringOccurrence(svc, campaignId);
    }
  }

  return NextResponse.json({
    ok: true,
    claimed: results.length,
    results,
  });
}

export async function GET(req: Request) {
  return runDispatchScheduled(req);
}

export async function POST(req: Request) {
  return runDispatchScheduled(req);
}
