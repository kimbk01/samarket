import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ADM-02 — `admin_notification_campaign_targets` keyed per occurrence.
 *
 * Target rows are history per occurrence (unique `occurrence_id,user_id`, migration
 * 20270513120000). Until the legacy unique `campaign_id,user_id` is dropped (migration
 * 20270513120100) the occurrence-keyed write can fail; we then fall back to the
 * legacy key so behaviour is never worse than before either migration is applied.
 */
export type CampaignTargetRow = {
  campaign_id: string;
  occurrence_id: string;
  user_id: string;
  status: "pending" | "sent" | "skipped" | "failed";
  failure_reason?: string | null;
  skip_reason?: string | null;
  notification_event_id?: string | null;
  sent_at?: string | null;
};

export type CampaignTargetWriteMode = "occurrence" | "legacy";

type PgError = { code?: string; message?: string } | null;

/**
 * 42P10: ON CONFLICT target has no matching unique (occurrence migration not applied).
 * 23505: legacy unique (campaign_id,user_id) still present and the user already has a row.
 */
function needsLegacyKey(error: PgError): boolean {
  return error?.code === "42P10" || error?.code === "23505";
}

export async function upsertCampaignTargetRows(
  svc: SupabaseClient,
  rows: CampaignTargetRow[],
  opts?: { ignoreDuplicates?: boolean }
): Promise<{ mode: CampaignTargetWriteMode; error: PgError }> {
  if (!rows.length) return { mode: "occurrence", error: null };
  const ignoreDuplicates = opts?.ignoreDuplicates === true;
  const table = svc.from("admin_notification_campaign_targets");
  const { error } = await table.upsert(rows, { onConflict: "occurrence_id,user_id", ignoreDuplicates });
  if (!error) return { mode: "occurrence", error: null };
  if (!needsLegacyKey(error)) return { mode: "occurrence", error };

  const { error: legacyError } = await svc
    .from("admin_notification_campaign_targets")
    .upsert(rows, { onConflict: "campaign_id,user_id", ignoreDuplicates });
  return { mode: "legacy", error: legacyError };
}
