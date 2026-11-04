import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ADM-02 — `admin_notification_campaign_targets` keyed per occurrence (unique `occurrence_id,user_id`).
 * 예전 캠페인 단위 키 `(campaign_id,user_id)` 는 운영에서 삭제했다(확정 설계 C-2 · 2026-11-04). 예전 키로 다시
 * 쓰던 재시도는 반복 2회차가 1회차 행을 덮어써 지웠다(B-20) — 회차 키 하나로만 쓴다.
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

export type CampaignTargetWriteMode = "occurrence";

type PgError = { code?: string; message?: string } | null;

export async function upsertCampaignTargetRows(
  svc: SupabaseClient,
  rows: CampaignTargetRow[],
  opts?: { ignoreDuplicates?: boolean }
): Promise<{ mode: CampaignTargetWriteMode; error: PgError }> {
  if (!rows.length) return { mode: "occurrence", error: null };
  const { error } = await svc
    .from("admin_notification_campaign_targets")
    .upsert(rows, { onConflict: "occurrence_id,user_id", ignoreDuplicates: opts?.ignoreDuplicates === true });
  return { mode: "occurrence", error: error ?? null };
}
