import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";
import { randomUUID } from "node:crypto";

export function newCampaignSendClaimToken(): string {
  return randomUUID();
}

/**
 * Atomically claim one due scheduled campaign (`scheduled` + `scheduled_at <= now` → `sending`).
 * Uses SKIP LOCKED RPC — safe under concurrent cron workers.
 */
export async function claimDueScheduledCampaign(
  svc: SupabaseClient,
  opts?: { claimToken?: string; now?: string }
): Promise<AdminNotificationCampaignRow | null> {
  const claimToken = opts?.claimToken?.trim() || newCampaignSendClaimToken();
  const now = opts?.now ?? new Date().toISOString();

  const { data, error } = await svc.rpc("claim_due_admin_notification_campaign", {
    p_claim_token: claimToken,
    p_now: now,
  });

  if (error) {
    console.error("[claimDueScheduledCampaign]", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return row as AdminNotificationCampaignRow;
}

export type ClaimManualSendResult = {
  claimed: boolean;
  alreadyRunning: boolean;
  campaign: AdminNotificationCampaignRow | null;
  error?: string;
};

/**
 * Atomic draft|scheduled|failed → sending with optional idempotency key.
 */
export async function claimAdminCampaignManualSend(
  svc: SupabaseClient,
  campaignId: string,
  opts: { idempotencyKey?: string | null; claimToken?: string }
): Promise<ClaimManualSendResult> {
  const id = campaignId.trim();
  if (!id) return { claimed: false, alreadyRunning: false, campaign: null, error: "invalid_id" };

  const claimToken = opts.claimToken?.trim() || newCampaignSendClaimToken();
  const idempotencyKey = opts.idempotencyKey?.trim() || null;

  const { data, error } = await svc.rpc("claim_admin_notification_campaign_send", {
    p_campaign_id: id,
    p_idempotency_key: idempotencyKey,
    p_claim_token: claimToken,
    p_now: new Date().toISOString(),
  });

  if (error) {
    console.error("[claimAdminCampaignManualSend]", error.message);
    return { claimed: false, alreadyRunning: false, campaign: null, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return { claimed: false, alreadyRunning: false, campaign: null, error: "not_found" };
  }

  const claimed = Boolean((row as { claimed?: unknown }).claimed);
  const alreadyRunning = Boolean((row as { already_running?: unknown }).already_running);
  const campaignRaw = (row as { campaign?: unknown }).campaign;
  const campaign =
    campaignRaw && typeof campaignRaw === "object"
      ? (campaignRaw as AdminNotificationCampaignRow)
      : null;

  return { claimed, alreadyRunning, campaign };
}

/**
 * Run existing batch SSOT until done or wall-clock budget exhausted.
 */
export async function drainNotificationCampaignSendBatches(
  svc: SupabaseClient,
  campaignId: string,
  opts?: { maxBatches?: number; maxWallMs?: number }
): Promise<{
  ok: boolean;
  done: boolean;
  batches: number;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
}> {
  const { runNotificationCampaignSendBatch } = await import(
    "@/lib/admin/notification-campaigns/run-campaign-send-batch"
  );

  const maxBatches = Math.max(1, Math.min(opts?.maxBatches ?? 40, 200));
  const maxWallMs = Math.max(5_000, Math.min(opts?.maxWallMs ?? 50_000, 120_000));
  const started = Date.now();

  let batches = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let done = false;

  while (batches < maxBatches && Date.now() - started < maxWallMs) {
    const result = await runNotificationCampaignSendBatch(svc, campaignId);
    batches += 1;
    if (!result.ok) {
      await svc
        .from("admin_notification_campaigns")
        .update({
          last_error: result.error ?? "batch_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);
      return {
        ok: false,
        done: result.done,
        batches,
        sent,
        skipped,
        failed,
        error: result.error,
      };
    }
    sent += result.sent;
    skipped += result.skipped;
    failed += result.failed;
    done = result.done;
    if (done) break;
  }

  return { ok: true, done, batches, sent, skipped, failed };
}
