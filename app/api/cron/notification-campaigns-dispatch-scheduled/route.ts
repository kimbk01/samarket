import { NextResponse } from "next/server";
import {
  claimDueOccurrence,
  getCampaignOccurrence,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import {
  CAMPAIGN_CONTINUABLE_ERRORS,
  drainNotificationCampaignSendBatches,
  newCampaignSendClaimToken,
  releaseOccurrenceForContinuation,
  scheduleNextRecurringOccurrence,
} from "@/lib/admin/notification-campaigns/claim-scheduled-campaign";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { runNotificationCampaignsCronTick } from "@/lib/cron/cron-due-ticks.server";

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
  const cronSideEffectsBlocked = rejectCronIfSideEffectsBlocked();
  if (cronSideEffectsBlocked) return cronSideEffectsBlocked;

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

  const tickStarted = Date.now();
  let slowestBatchMs = 0;
  /**
   * 2026-11-19 예약 작업 4번 — 첫 확보 + (확보 없을 때) 반복 캠페인 확인을 DB 함수 1번으로.
   * 확보가 있으면 아래 기존 경로 그대로. 함수가 없거나 오류면 null → 기존처럼 따로 조회.
   */
  const firstClaimToken = newCampaignSendClaimToken();
  const dueTick = await runNotificationCampaignsCronTick<NonNullable<Awaited<ReturnType<typeof claimDueOccurrence>>>>(
    svc,
    firstClaimToken
  );
  if (!dueTick) console.warn("[cron notification-campaigns-dispatch-scheduled] tick_fallback");
  for (let i = 0; i < MAX_OCCURRENCES_PER_TICK; i += 1) {
    // U1-B: do not claim another occurrence when one more batch would not fit the tick budget.
    const remainingMs = MAX_WALL_MS_PER_OCCURRENCE - (Date.now() - tickStarted);
    if (i > 0 && remainingMs < slowestBatchMs) break;
    const claimToken = i === 0 ? firstClaimToken : newCampaignSendClaimToken();
    const claimed = i === 0 && dueTick ? dueTick.claimed : await claimDueOccurrence(svc, { claimToken });
    if (!claimed?.id) break;

    const drained = await drainNotificationCampaignSendBatches(svc, claimed.id, {
      maxBatches: MAX_BATCHES_PER_OCCURRENCE,
      maxWallMs: Math.max(5_000, MAX_WALL_MS_PER_OCCURRENCE - (Date.now() - tickStarted)),
    });
    slowestBatchMs = Math.max(slowestBatchMs, drained.slowestBatchMs ?? 0);

    if (!drained.ok && drained.skippedReason) {
      // ADM-08: skip already recorded on the occurrence (source_skipped:<reason>) — keep it.
    } else if (!drained.ok) {
      await svc
        .from("admin_notification_campaign_occurrences")
        .update({
          last_error: drained.error ?? "batch_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);
      if (CAMPAIGN_CONTINUABLE_ERRORS.has(String(drained.error ?? ""))) {
        await releaseOccurrenceForContinuation(svc, claimed.id, claimToken, drained.error ?? null);
      }
    } else if (!drained.done) {
      // U1-B: continue on the next tick instead of waiting for lease expiry.
      await releaseOccurrenceForContinuation(svc, claimed.id, claimToken);
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

  if (dueTick && dueTick.claimed === null) {
    // 확보한 회차가 없던 실행 — DB 함수가 기존과 같은 조건으로 고른 캠페인만 다음 회차를 만든다.
    for (const campaignId of dueTick.recurringMissing) {
      await scheduleNextRecurringOccurrence(svc, campaignId);
    }
    return NextResponse.json({ ok: true, claimed: results.length, results });
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
