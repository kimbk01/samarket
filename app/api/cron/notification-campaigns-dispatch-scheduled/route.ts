import { NextResponse } from "next/server";
import {
  claimDueScheduledCampaign,
  drainNotificationCampaignSendBatches,
  newCampaignSendClaimToken,
} from "@/lib/admin/notification-campaigns/claim-scheduled-campaign";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Max campaigns claimed per cron invocation. */
const MAX_CAMPAIGNS_PER_TICK = 3;
/** Max batch loops per campaign within this tick. */
const MAX_BATCHES_PER_CAMPAIGN = 25;
const MAX_WALL_MS_PER_CAMPAIGN = 45_000;

/**
 * Vercel Cron — due scheduled admin notification campaigns.
 * Auth: Authorization Bearer CRON_SECRET | x-cron-secret
 * Reuses runNotificationCampaignSendBatch via drain helper (no new FCM path).
 */
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
    campaignId: string;
    ok: boolean;
    done: boolean;
    batches: number;
    sent: number;
    skipped: number;
    failed: number;
    error?: string;
  }> = [];

  for (let i = 0; i < MAX_CAMPAIGNS_PER_TICK; i += 1) {
    const claimToken = newCampaignSendClaimToken();
    const claimed = await claimDueScheduledCampaign(svc, { claimToken });
    if (!claimed?.id) break;

    if (String(claimed.target_type) === "segment") {
      await svc
        .from("admin_notification_campaigns")
        .update({
          status: "failed",
          last_error: "segment_unsupported",
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);
      results.push({
        campaignId: claimed.id,
        ok: false,
        done: true,
        batches: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        error: "segment_unsupported",
      });
      continue;
    }

    const drained = await drainNotificationCampaignSendBatches(svc, claimed.id, {
      maxBatches: MAX_BATCHES_PER_CAMPAIGN,
      maxWallMs: MAX_WALL_MS_PER_CAMPAIGN,
    });

    if (!drained.ok) {
      await svc
        .from("admin_notification_campaigns")
        .update({
          last_error: drained.error ?? "batch_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);
    }

    results.push({
      campaignId: claimed.id,
      ok: drained.ok,
      done: drained.done,
      batches: drained.batches,
      sent: drained.sent,
      skipped: drained.skipped,
      failed: drained.failed,
      error: drained.error,
    });
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
